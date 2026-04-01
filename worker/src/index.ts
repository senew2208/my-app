import Stripe from "stripe";
import { verifyToken } from "@clerk/backend";

const PROVISIONING_TEAM_EMAILS = [
	"senew2208@gmail.com",
	"avitiw@gmail.com",
];

interface ClerkPayload {
	sub: string;
	email_addresses?: { email_address: string; id: string; verified: boolean }[];
}

function generateId() {
	return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default {
	async fetch(request: Request, env: any): Promise<Response> {
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
				return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400, headers: corsHeaders });
			}

			try {
				const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
				const body = await request.text();
				const event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);

				if (event.type === "checkout.session.completed") {
					const session = event.data.object as any;

					// Get session details
					const retrievedSession = await stripe.checkout.sessions.retrieve(session.id, {
						expand: ["line_items"],
					});

					const lineItem = (retrievedSession.line_items?.data || [])[0];
					const productName = lineItem?.description || "Product";
					const amount = (lineItem?.amount_total || 0) / 100; // Convert cents to dollars

					// Store in D1
					const transactionId = generateId();
					const now = new Date().toISOString();

					await env.DB.prepare(`
						INSERT INTO transactions (id, userId, email, sessionId, productName, amount, status, createdAt, updatedAt)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
					`).bind(
						transactionId,
						session.client_reference_id || "unknown",
						session.customer_email || "unknown",
						session.id,
						productName,
						amount,
						"completed",
						now,
						now
					).run();

					console.log("Transaction stored:", transactionId);
					return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
				}

				return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
			} catch (err) {
				console.error("Webhook error:", err);
				return new Response(JSON.stringify({ error: "Webhook failed" }), { status: 400, headers: corsHeaders });
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
				console.error(err);
				return new Response(JSON.stringify({ error: "Failed to retrieve session" }), { status: 500, headers: corsHeaders });
			}
		}

		// Provisioning routes: check auth
		if (pathname.startsWith("/provisioning/")) {
			const authHeader = request.headers.get("Authorization");
			if (!authHeader) {
				return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), { status: 401, headers: corsHeaders });
			}
			const token = authHeader.replace("Bearer ", "");

			let user: any;
			try {
				user = await verifyToken(token, {
					secretKey: env.CLERK_SECRET_KEY,
				});
			} catch (err) {
				console.error(err);
				return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), { status: 401, headers: corsHeaders });
			}

			// Get email from query parameter (sent by frontend)
			const userEmail = url.searchParams.get("email");
			console.log("Provisioning route - Email from frontend:", userEmail);
			console.log("Provisioning route - Allowed emails:", PROVISIONING_TEAM_EMAILS);

			if (!userEmail || !PROVISIONING_TEAM_EMAILS.includes(userEmail)) {
				console.log("Provisioning route - Access denied for email:", userEmail);
				return new Response(JSON.stringify({ error: "Forbidden: Not in provisioning team" }), { status: 403, headers: corsHeaders });
			}

			// GET all transactions
			if (request.method === "GET" && pathname === "/provisioning/transactions") {
				try {
					const result = await env.DB.prepare(`
						SELECT * FROM transactions ORDER BY createdAt DESC
					`).all();
					return new Response(JSON.stringify(result.results), { headers: corsHeaders });
				} catch (err) {
					console.error(err);
					return new Response(JSON.stringify({ error: "Failed to fetch transactions" }), { status: 500, headers: corsHeaders });
				}
			}

			// PUT update transaction status/comments
			if (request.method === "PUT" && pathname === "/provisioning/transactions") {
				try {
					const { id, status, comments } = (await request.json()) as { id: string; status?: string; comments?: string };
					const now = new Date().toISOString();

					const result = await env.DB.prepare(`
						UPDATE transactions SET status = ?, comments = ?, updatedAt = ? WHERE id = ?
					`).bind(status || "pending", comments || "", now, id).run();

					console.log("Transaction updated:", id, "by", userEmail);
					return new Response(JSON.stringify({ success: result.success }), { headers: corsHeaders });
				} catch (err) {
					console.error(err);
					return new Response(JSON.stringify({ error: "Failed to update transaction" }), { status: 500, headers: corsHeaders });
				}
			}
		}

		// Authenticated user routes: regular checkout
		const authHeader = request.headers.get("Authorization");
		if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), { status: 401, headers: corsHeaders });
		const token = authHeader.replace("Bearer ", "");

		let user: any;
		try {
			user = await verifyToken(token, {
				secretKey: env.CLERK_SECRET_KEY,
			});
		} catch (err) {
			console.error(err);
			return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), { status: 401, headers: corsHeaders });
		}

		// POST checkout
		if (request.method === "POST" && pathname === "/") {
			const { priceId } = (await request.json()) as { priceId: string };

			try {
				const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
				const frontendUrl = env.FRONTEND_URL || "https://my-app-eha.pages.dev";

				const session = await stripe.checkout.sessions.create({
					mode: "payment",
					line_items: [{ price: priceId, quantity: 1 }],
					customer_email: user.email_addresses?.[0]?.email_address || undefined,
					client_reference_id: user.sub,
					success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
					cancel_url: `${frontendUrl}/cancel`,
				});

				return new Response(JSON.stringify({ url: session.url }), { headers: corsHeaders });
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				console.error("Stripe checkout error:", errorMsg, err);
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
				JSON.stringify({
					message: "Authenticated 🚀",
					userId: user.sub,
					email,
					transactions: userTransactions.results,
				}),
				{ headers: corsHeaders }
			);
		} catch (err) {
			console.error(err);
			return new Response(
				JSON.stringify({
					message: "Authenticated 🚀",
					userId: user.sub,
					email,
					transactions: [],
				}),
				{ headers: corsHeaders }
			);
		}
	},
};
