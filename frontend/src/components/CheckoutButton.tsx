import React from "react";
import { useAuth } from "@clerk/react";

interface CheckoutButtonProps {
  priceId: string;
}

const CheckoutButton: React.FC<CheckoutButtonProps> = ({ priceId }) => {
  const { getToken } = useAuth();

  const handleCheckout = async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("https://worker.senew2208.workers.dev", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");

      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout error:", err);
    }
  };

  return <button onClick={handleCheckout}>Subscribe / Pay</button>;
};

export default CheckoutButton;