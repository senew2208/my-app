import React from "react";
import { useAuth, useUser } from "@clerk/react";

interface CheckoutButtonProps {
  priceId: string;
}

const CheckoutButton: React.FC<CheckoutButtonProps> = ({ priceId }) => {
  const { getToken } = useAuth();
  const { user } = useUser();

  const handleCheckout = async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const email = user?.primaryEmailAddress?.emailAddress;
      if (!email) throw new Error("Email not found");

      const res = await fetch("https://worker.senew2208.workers.dev", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId, email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (!data.url) throw new Error("No checkout URL returned");

      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert(`Checkout error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return <button onClick={handleCheckout}>Subscribe / Pay</button>;
};

export default CheckoutButton;