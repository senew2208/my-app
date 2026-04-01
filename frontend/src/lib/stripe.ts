import { loadStripe, Stripe } from "@stripe/stripe-js";

// Use your Stripe **publishable key** (pk_test_...)
//export const stripePromise: Promise<Stripe | null> 

const stripePromise = loadStripe("pk_test_51THHQnRBIrAzqMIjaaOK1pVUmmpkrESuPKPu1RVUBoshTC9YFuq2AE3uuQdGrOMQAkFPgxUXvidipr5LutDfB4E300hgFdRQ7E");
 export default stripePromise;