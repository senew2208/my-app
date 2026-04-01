import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import "./ProvisioningPage.css";

const PROVISIONING_TEAM_EMAILS = [
	"provisioning@example.com",
	"admin@example.com",
];

export default function ProvisioningPage() {
	const { user } = useUser();
	const { getToken } = useAuth();
	const navigate = useNavigate();
	const [transactions, setTransactions] = useState([]);
	const [loading, setLoading] = useState(true);
	const [editingId, setEditingId] = useState(null);
	const [editStatus, setEditStatus] = useState("");
	const [editComments, setEditComments] = useState("");

	const userEmail = user?.primaryEmailAddress?.emailAddress;
	const isProvisioning = userEmail && PROVISIONING_TEAM_EMAILS.includes(userEmail);

	useEffect(() => {
		console.log("User email:", userEmail);
		console.log("Provisioning team emails:", PROVISIONING_TEAM_EMAILS);
		console.log("Is provisioning:", isProvisioning);

		if (!isProvisioning) {
			console.log("Not authorized, redirecting to /");
			navigate("/");
			return;
		}

		fetchTransactions();
	}, [isProvisioning, navigate]);

	const fetchTransactions = async () => {
		try {
			setLoading(true);
			const token = await getToken();
			const res = await fetch("https://worker.senew2208.workers.dev/provisioning/transactions", {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});
			const data = await res.json();
			setTransactions(data);
		} catch (err) {
			console.error("Error fetching transactions:", err);
		} finally {
			setLoading(false);
		}
	};

	const handleEdit = (txn) => {
		setEditingId(txn.id);
		setEditStatus(txn.status);
		setEditComments(txn.comments || "");
	};

	const handleSave = async (txnId) => {
		try {
			const token = await getToken();
			const res = await fetch("https://worker.senew2208.workers.dev/provisioning/transactions", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					id: txnId,
					status: editStatus,
					comments: editComments,
				}),
			});

			if (res.ok) {
				setEditingId(null);
				fetchTransactions();
			}
		} catch (err) {
			console.error("Error updating transaction:", err);
		}
	};

	if (!isProvisioning) {
		return null;
	}

	if (loading) {
		return <div className="provisioning-container"><p>Loading transactions...</p></div>;
	}

	return (
		<div className="provisioning-container">
			<header className="provisioning-header">
				<h1>Provisioning Dashboard</h1>
				<p>Manage customer transactions</p>
			</header>

			<div className="transactions-table-wrapper">
				{transactions.length === 0 ? (
					<p className="no-data">No transactions yet</p>
				) : (
					<table className="transactions-table">
						<thead>
							<tr>
								<th>ID</th>
								<th>Email</th>
								<th>Product</th>
								<th>Amount</th>
								<th>Status</th>
								<th>Comments</th>
								<th>Created</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{transactions.map((txn) => (
								<tr key={txn.id} className={`status-${txn.status}`}>
									<td className="txn-id">{txn.id}</td>
									<td>{txn.email}</td>
									<td>{txn.productName}</td>
									<td className="amount">${txn.amount.toFixed(2)}</td>
									<td>
										{editingId === txn.id ? (
											<select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
												<option value="completed">Completed</option>
												<option value="processing">Processing</option>
												<option value="provisioned">Provisioned</option>
												<option value="failed">Failed</option>
											</select>
										) : (
											<span className={`status-badge status-${txn.status}`}>{txn.status}</span>
										)}
									</td>
									<td>
										{editingId === txn.id ? (
											<input
												type="text"
												value={editComments}
												onChange={(e) => setEditComments(e.target.value)}
												placeholder="Add comments"
											/>
										) : (
											<span>{txn.comments || "-"}</span>
										)}
									</td>
									<td className="created-at">{new Date(txn.createdAt).toLocaleDateString()}</td>
									<td>
										{editingId === txn.id ? (
											<div className="action-buttons">
												<button onClick={() => handleSave(txn.id)} className="btn-save">Save</button>
												<button onClick={() => setEditingId(null)} className="btn-cancel">Cancel</button>
											</div>
										) : (
											<button onClick={() => handleEdit(txn)} className="btn-edit">Edit</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
