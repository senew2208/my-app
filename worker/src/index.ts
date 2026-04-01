import Stripe from "stripe";
import { verifyToken } from "@clerk/backend";

const PROVISIONING_TEAM_EMAILS = [
	"senew2208@gmail.com",
	"tnudraft@gmail.com",
	"avitiw@gmail.com",
];

interface ClerkPayload {
	sub: string;
	email_addresses?: { email_address: string; id: string; verified: boolean }[];
}

type LogLevel = "debug" | "info" | "error";

function createLogger(env: any) {
	const level: LogLevel = env.LOG_LEVEL || "info";
	const levels: Record<LogLevel, number> = { debug: 0, info: 1, error: 2 };

	return {
		debug: (...args: any[]) => levels[level] <= 0 && console.log("[debug]", ...args),
		info:  (...args: any[]) => levels[level] <= 1 && console.log("[info]",  ...args),
		error: (...args: any[]) => console.error("[error]", ...args),
	};
}

export default {
	async fetch(request: Request, env: any): Promise<Response> {
		const log = createLogger(env);

		const corsHeaders = {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
			"Access-Control-Allow-Headers": "Authorization, Content-Type, Stripe-Signature",
		};

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(request.url);
		const pathname = url.pathname;

		// Public route: Stripe webhook
		if (request.method === "POST" && pathname === "/webhook") {
			const signature = request.headers.get("Stripe-Signature");
			if (!signature) {
				log.error("Missing Stripe-Signature header");
				return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400, headers: corsHeaders });
			}

			try {
				const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
				const body = await request.text();
				const event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);

				log.debug("Webhook event received:", event.type);

				if (event.type === "checkout.session.completed") {
					const session = event.data.object as any;
					log.debug("Session ID:", session.id, "Payment Intent:", session.payment_intent, "Email:", session.customer_email);

					const retrievedSession = await stripe.checkout.sessions.retrieve(session.id, {
						expand: ["line_items"],
					});

					const lineItem = (retrievedSession.line_items?.data || [])[0];
					const productName = lineItem?.description || "Product";
					const amountCents = lineItem?.amount_total || 0;
					const currency = retrievedSession.currency || "usd";

					const paymentIntentId = session.payment_intent;
					if (!paymentIntentId) {
						log.error("No payment intent ID in session:", session.id);
						return new Response(JSON.stringify({ error: "No payment intent ID" }), { status: 400, headers: corsHeaders });
					}

					const now = new Date().toISOString();

					await env.DB.prepare(`
						INSERT INTO transactions (id, userId, email, sessionId, productName, amount, currency, status, provisioned, createdAt, updatedAt)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`).bind(
						paymentIntentId,
						session.client_reference_id || "unknown",
						session.customer_email || "unknown",
						session.id,
						productName,
						amountCents,
						currency,
						"succeeded",
						0,
						now,
						now
					).run();

					log.info("Transaction stored:", paymentIntentId, "email:", session.customer_email);
					return new Response(JSON.stringify({ success: true, transactionId: paymentIntentId }), { headers: corsHeaders });
				}

				log.debug("Unhandled event type:", event.type);
				return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
			} catch (err) {
				log.error("Webhook failed:", err instanceof Error ? err.message : String(err));
				return new Response(JSON.stringify({ error: "Webhook failed", details: err instanceof Error ? err.message : String(err) }), { status: 400, headers: corsHeaders });
			}
		}

		// Public route: verify checkout session
		if (request.method === "GET" && pathname === "/checkout-session") {
			const sessionId = url.searchParams.get("session_id");
			if (!sessionId) {
				return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: corsHeaders });
			}
			try {
				const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
				const session = await stripe.checkout.sessions.retrieve(sessionId);
				return new Response(
					JSON.stringify({ status: session.status, payment_status: session.payment_status }),
					{ headers: corsHeaders }
				);
			} catch (err) {
				log.error("Failed to retrieve checkout session:", err);
				return new Response(JSON.stringify({ error: "Failed to retrieve session" }), { status: 500, headers: corsHeaders });
			}
		}

		// Provisioning routes
		if (pathname.startsWith("/provisioning/")) {
			const authHeader = request.headers.get("Authorization");
			if (!authHeader) {
				return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), { status: 401, headers: corsHeaders });
			}
			const token = authHeader.replace("Bearer ", "");

			let user: any;
			try {
				user = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
			} catch (err) {
				log.error("Invalid Clerk token:", err);
				return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), { status: 401, headers: corsHeaders });
			}

			const userEmail = url.searchParams.get("email");
			if (!userEmail || !PROVISIONING_TEAM_EMAILS.includes(userEmail)) {
				log.info("Provisioning access denied for:", userEmail);
				return new Response(JSON.stringify({ error: "Forbidden: Not in provisioning team" }), { status: 403, headers: corsHeaders });
			}

			if (request.method === "GET" && pathname === "/provisioning/transactions") {
				try {
					const result = await env.DB.prepare(`
						SELECT * FROM transactions ORDER BY createdAt DESC
					`).all();
					return new Response(JSON.stringify(result.results), { headers: corsHeaders });
				} catch (err) {
					log.error("Failed to fetch transactions:", err);
					return new Response(JSON.stringify({ error: "Failed to fetch transactions" }), { status: 500, headers: corsHeaders });
				}
			}

			if (request.method === "PUT" && pathname === "/provisioning/transactions") {
				try {
					const { id, status, comments, provisioned } = (await request.json()) as { id: string; status?: string; comments?: string; provisioned?: boolean };
					const now = new Date().toISOString();

					const result = await env.DB.prepare(`
						UPDATE transactions SET status = ?, comments = ?, provisioned = ?, updatedAt = ? WHERE id = ?
					`).bind(status || "pending", comments || "", provisioned ? 1 : 0, now, id).run();

					log.info("Transaction updated:", id, "by", userEmail);
					return new Response(JSON.stringify({ success: result.success }), { headers: corsHeaders });
				} catch (err) {
					log.error("Failed to update transaction:", err);
					return new Response(JSON.stringify({ error: "Failed to update transaction" }), { status: 500, headers: corsHeaders });
				}
			}
		}

		// Authenticated user routes
		const authHeader = request.headers.get("Authorization");
		if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), { status: 401, headers: corsHeaders });
		const token = authHeader.replace("Bearer ", "");

		let user: any;
		try {
			user = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
		} catch (err) {
			log.error("Invalid Clerk token:", err);
			return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), { status: 401, headers: corsHeaders });
		}

		// POST checkout
		if (request.method === "POST" && pathname === "/") {
			const { priceId, email } = (await request.json()) as { priceId: string; email?: string };

			try {
				const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
				const frontendUrl = env.FRONTEND_URL || "https://my-app-eha.pages.dev";

				log.debug("Creating checkout session - priceId:", priceId, "email:", email);

				const session = await stripe.checkout.sessions.create({
					mode: "payment",
					line_items: [{ price: priceId, quantity: 1 }],
					customer_email: email || undefined,
					client_reference_id: user.sub,
					success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
					cancel_url: `${frontendUrl}/cancel`,
				});

				log.info("Checkout session created:", session.id);
				return new Response(JSON.stringify({ url: session.url }), { headers: corsHeaders });
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				log.error("Stripe checkout error:", errorMsg);
				return new Response(JSON.stringify({ error: `Stripe error: ${errorMsg}` }), { status: 500, headers: corsHeaders });
			}
		}

		// GET user info & their transactions
		const email = user.email_addresses?.[0]?.email_address || user.email || null;

		try {
			const userTransactions = await env.DB.prepare(`
				SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC
			`).bind(user.sub).all();

			return new Response(
				JSON.stringify({ message: "Authenticated 🚀", userId: user.sub, email, transactions: userTransactions.results }),
				{ headers: corsHeaders }
			);
		} catch (err) {
			log.error("Failed to fetch user transactions:", err);
			return new Response(
				JSON.stringify({ message: "Authenticated 🚀", userId: user.sub, email, transactions: [] }),
				{ headers: corsHeaders }
			);
		}
	},
};
