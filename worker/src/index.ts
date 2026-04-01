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

		// Get Authorization token
		const authHeader = request.headers.get("Authorization");
		if (!authHeader) return new Response("Unauthorized: Missing token", { status: 401, headers: corsHeaders });
		const token = authHeader.replace("Bearer ", "");

		// Verify Clerk token
		let user: ClerkPayload;
		try {
			user = (await verifyToken(token, {
				secretKey: env.CLERK_SECRET_KEY,
			})) as ClerkPayload;
		} catch (err) {
			console.error(err);
			return new Response("Unauthorized: Invalid token", { status: 401, headers: corsHeaders });
		}

		// Handle POST request for Stripe checkout
		if (request.method === "POST") {
			const { priceId } = (await request.json()) as { priceId: string };

			try {
				const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });

				const session = await stripe.checkout.sessions.create({
					mode: "subscription", // or "payment" for one-time
					line_items: [{ price: priceId, quantity: 1 }],
					customer_email: user.email_addresses?.[0]?.email_address || undefined,
					success_url: "https://your-site.pages.dev/success",
					cancel_url: "https://your-site.pages.dev/cancel",
				});

				return new Response(JSON.stringify({ sessionId: session.id }), { headers: corsHeaders });
			} catch (err) {
				console.error(err);
				return new Response("Stripe error", { status: 500, headers: corsHeaders });
			}
		}

		// GET request (or fallback) returns user info
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