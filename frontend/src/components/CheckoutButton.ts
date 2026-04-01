import React from "react";
import { useAuth } from "@clerk/react";
import stripePromise  from "../lib/stripe";

interface CheckoutButtonProps {
  priceId: string; // Stripe price ID
}

const CheckoutButton: React.FC<CheckoutButtonProps> = ({ priceId }) => {
  const { getToken } = useAuth();

  const handleCheckout = async () => {
    try {
      const token = await getToken(); // Clerk JWT

      // Call Worker POST endpoint
      const res = await fetch("https://worker.senew2208.workers.dev", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();

      const stripe = await stripePromise;
      if (!stripe) throw new Error("Stripe.js failed to load");

      const { error } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });

      if (error) console.error(error);
    } catch (err) {
      console.error("Checkout error:", err);
    }
  };

  return <button onClick={handleCheckout}>Subscribe / Pay</button>;
};

export default CheckoutButton;