import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

export default function SuccessPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading");
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    fetch(`https://worker.senew2208.workers.dev/checkout-session?session_id=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "complete" || data.payment_status === "paid") {
          setStatus("success");
        } else {
          setStatus("pending");
        }
      })
      .catch(() => setStatus("error"));
  }, [sessionId]);

  if (status === "loading") {
    return <p>Verifying your payment...</p>;
  }

  if (status === "error") {
    return (
      <div>
        <h1>Something went wrong</h1>
        <p>We couldn't verify your payment. Please contact support.</p>
        <Link to="/">Go home</Link>
      </div>
    );
  }

  return (
    <div>
      <h1>Payment successful!</h1>
      <p>Thank you for subscribing. Your account is now active.</p>
      <Link to="/">Go to dashboard</Link>
    </div>
  );
}
