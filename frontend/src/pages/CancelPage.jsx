import { Link } from "react-router-dom";

export default function CancelPage() {
  return (
    <div>
      <h1>Payment cancelled</h1>
      <p>No charges were made. You can try again whenever you're ready.</p>
      <Link to="/">Go back</Link>
    </div>
  );
}
