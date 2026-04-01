/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// export default {
// 	async fetch(request, env, ctx): Promise<Response> {
// 		return new Response(JSON.stringify({ message: "API working 🚀" }),
//       { headers: { "Content-Type": "application/json",
//           "Access-Control-Allow-Origin": "*", } });
// 	},
// } satisfies ExportedHandler<Env>;


import { verifyToken } from "@clerk/backend";

interface ClerkPayload {
  sub: string;
  email_addresses?: { email_address: string; id: string; verified: boolean }[];
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const token = authHeader.replace("Bearer ", "");

    try {
      const payload = (await verifyToken(token, {
        secretKey: env.CLERK_SECRET_KEY,
      })) as ClerkPayload;

      const email = payload.email_addresses?.[0]?.email_address || null;

      return new Response(
        JSON.stringify({
          message: "Authenticated 🚀",
          userId: payload.sub,
          email,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      console.error(err);
      return new Response("Unauthorized: Invalid token", { status: 401 });
    }
  },
};