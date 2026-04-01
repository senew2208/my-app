import Stripe from "stripe";
import { verifyToken } from "@clerk/backend";

interface ClerkPayload {
	sub: string;
	email_addresses?: { email_address: string; id: string; verified: boolean }[];
}

export default {
	async fetch(request: Request, env: any): Promise<Response> {
		const corsHeaders = {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*", // For dev; restrict in prod
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Authorization, Content-Type",
		};

		// Handle preflight request
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(request.url);
		const pathname = url.pathname;

		// Public route: verify checkout session (called from /success page)
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

		// All other routes require Clerk auth
		const authHeader = request.headers.get("Authorization");
		if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), { status: 401, headers: corsHeaders });
		const token = authHeader.replace("Bearer ", "");

		let user: ClerkPayload;
		try {
			user = (await verifyToken(token, {
				secretKey: env.CLERK_SECRET_KEY,
			})) as ClerkPayload;
		} catch (err) {
			console.error(err);
			return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), { status: 401, headers: corsHeaders });
		}

		// Handle POST request for Stripe checkout
		if (request.method === "POST") {
			const { priceId } = (await request.json()) as { priceId: string };

			try {
				const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
				const frontendUrl = env.FRONTEND_URL || "https://my-app-eha.pages.dev";

				const session = await stripe.checkout.sessions.create({
					mode: "payment",
					line_items: [{ price: priceId, quantity: 1 }],
					customer_email: user.email_addresses?.[0]?.email_address || undefined,
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

		// GET / returns user info
		const email = user.email_addresses?.[0]?.email_address || null;
		return new Response(
			JSON.stringify({
				message: "Authenticated 🚀",
				userId: user.sub,
				email,
			}),
			{ headers: corsHeaders }
		);
	},
};
