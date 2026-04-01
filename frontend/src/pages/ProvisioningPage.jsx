import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import "./ProvisioningPage.css";

const PROVISIONING_TEAM_EMAILS = [
	"senew2208@gmail.com",
	"avitiw@gmail.com",
];

const PAGE_SIZE = 10;

const formatStatus = (status) => {
	if (!status) return "Pending";
	return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

const formatDate = (iso) => {
	return new Date(iso).toLocaleString("en-US", {
		month: "short", day: "numeric", year: "numeric",
		hour: "2-digit", minute: "2-digit",
	});
};

export default function ProvisioningPage() {
	const { user, isLoaded } = useUser();
	const { getToken } = useAuth();
	const navigate = useNavigate();

	const [transactions, setTransactions] = useState([]);
	const [transLoading, setTransLoading] = useState(true);
	const [expandedId, setExpandedId] = useState(null);
	const [editingId, setEditingId] = useState(null);
	const [editStatus, setEditStatus] = useState("");
	const [editComments, setEditComments] = useState("");
	const [editProvisioned, setEditProvisioned] = useState(false);
	const [filterStatus, setFilterStatus] = useState("all");
	const [page, setPage] = useState(1);
	const [saving, setSaving] = useState(false);
	const [copied, setCopied] = useState(null);

	const userEmail = user?.primaryEmailAddress?.emailAddress;
	const isProvisioning = userEmail && PROVISIONING_TEAM_EMAILS.includes(userEmail);

	useEffect(() => {
		if (!isLoaded) return;
		if (!isProvisioning) { navigate("/"); return; }
		fetchTransactions();
	}, [isLoaded, userEmail, navigate, isProvisioning]);

	const fetchTransactions = async () => {
		try {
			setTransLoading(true);
			const token = await getToken();
			const res = await fetch(
				`https://worker.senew2208.workers.dev/provisioning/transactions?email=${encodeURIComponent(userEmail)}`,
				{ headers: { Authorization: `Bearer ${token}` } }
			);
			const data = await res.json();
			const sorted = [...data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
			setTransactions(sorted);
		} catch (err) {
			console.error("Error fetching transactions:", err);
		} finally {
			setTransLoading(false);
		}
	};

	const handleEdit = (txn) => {
		setEditingId(txn.id);
		setEditStatus(txn.status);
		setEditComments(txn.comments || "");
		setEditProvisioned(!!txn.provisioned);
	};

	const handleSave = async (txnId) => {
		try {
			setSaving(true);
			const token = await getToken();
			const res = await fetch(
				`https://worker.senew2208.workers.dev/provisioning/transactions?email=${encodeURIComponent(userEmail)}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
					body: JSON.stringify({ id: txnId, status: editStatus, comments: editComments, provisioned: editProvisioned }),
				}
			);
			if (res.ok) {
				setEditingId(null);
				fetchTransactions();
			}
		} catch (err) {
			console.error("Error updating transaction:", err);
		} finally {
			setSaving(false);
		}
	};

	const copyToClipboard = (text, key) => {
		navigator.clipboard.writeText(text);
		setCopied(key);
		setTimeout(() => setCopied(null), 1500);
	};

	const filtered = transactions.filter(
		(t) => filterStatus === "all" || t.status === filterStatus
	);
	const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
	const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	const handleFilterChange = (status) => {
		setFilterStatus(status);
		setPage(1);
		setExpandedId(null);
	};

	const counts = {
		all: transactions.length,
		pending: transactions.filter((t) => t.status === "pending").length,
		succeeded: transactions.filter((t) => t.status === "succeeded").length,
		failed: transactions.filter((t) => t.status === "failed").length,
	};

	if (!isLoaded || transLoading) {
		return (
			<div className="prov-container">
				<div className="prov-loading">Loading...</div>
			</div>
		);
	}

	if (!isProvisioning) return null;

	return (
		<div className="prov-container">
			<div className="prov-header">
				<div>
					<h1>Provisioning Dashboard</h1>
					<p className="prov-subtitle">Review and manage customer transactions</p>
				</div>
				<button className="refresh-btn" onClick={fetchTransactions}>↻ Refresh</button>
			</div>

			<div className="prov-filters">
				{["all", "pending", "succeeded", "failed"].map((s) => (
					<button
						key={s}
						className={`filter-btn ${filterStatus === s ? "active" : ""} filter-${s}`}
						onClick={() => handleFilterChange(s)}
					>
						{formatStatus(s)} <span className="filter-count">{counts[s]}</span>
					</button>
				))}
			</div>

			{filtered.length === 0 ? (
				<div className="prov-empty">No transactions found</div>
			) : (
				<>
					<div className="prov-list">
						{paginated.map((txn) => {
							const isExpanded = expandedId === txn.id;
							const isEditing = editingId === txn.id;
							return (
								<div key={txn.id} className={`prov-card border-${txn.status}`}>
									<div
										className="prov-card-summary"
										onClick={() => setExpandedId(isExpanded ? null : txn.id)}
									>
										<div className="prov-card-left">
											<span className="prov-email">{txn.email}</span>
											<span className="prov-product">{txn.productName}</span>
										</div>
										<div className="prov-card-right">
											<span className="prov-amount">
												${(txn.amount / 100).toFixed(2)}
												<span className="prov-currency">{txn.currency?.toUpperCase() || "USD"}</span>
											</span>
											<span className={`prov-status-badge status-${txn.status}`}>
												{formatStatus(txn.status)}
											</span>
											<span className="prov-date">{formatDate(txn.createdAt)}</span>
											<span className="prov-chevron">{isExpanded ? "▲" : "▼"}</span>
										</div>
									</div>

									{isExpanded && (
										<div className="prov-card-detail">
											<div className="prov-detail-grid">
												<div className="prov-detail-item">
													<span className="prov-detail-label">Payment ID</span>
													<div className="prov-detail-id">
														<code>{txn.id}</code>
														<button
															className={`copy-btn ${copied === `pid-${txn.id}` ? "copied" : ""}`}
															onClick={() => copyToClipboard(txn.id, `pid-${txn.id}`)}
														>
															{copied === `pid-${txn.id}` ? "✓" : "Copy"}
														</button>
													</div>
												</div>
												<div className="prov-detail-item">
													<span className="prov-detail-label">Session ID</span>
													<div className="prov-detail-id">
														<code>{txn.sessionId}</code>
														<button
															className={`copy-btn ${copied === `sid-${txn.id}` ? "copied" : ""}`}
															onClick={() => copyToClipboard(txn.sessionId, `sid-${txn.id}`)}
														>
															{copied === `sid-${txn.id}` ? "✓" : "Copy"}
														</button>
													</div>
												</div>
												<div className="prov-detail-item">
													<span className="prov-detail-label">Payment Status</span>
													{isEditing ? (
														<select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
															<option value="pending">Pending</option>
															<option value="succeeded">Succeeded</option>
															<option value="failed">Failed</option>
														</select>
													) : (
														<span className={`prov-status-badge status-${txn.status}`}>{formatStatus(txn.status)}</span>
													)}
												</div>
												<div className="prov-detail-item">
													<span className="prov-detail-label">Provisioning Status</span>
													{isEditing ? (
														<label className="toggle-label">
															<input
																type="checkbox"
																checked={editProvisioned}
																onChange={(e) => setEditProvisioned(e.target.checked)}
															/>
															<span className={`prov-prov-badge ${editProvisioned ? "done" : "waiting"}`}>
																{editProvisioned ? "✓ Provisioned" : "⏳ Awaiting"}
															</span>
														</label>
													) : (
														<span className={`prov-prov-badge ${txn.provisioned ? "done" : "waiting"}`}>
															{txn.provisioned ? "✓ Provisioned" : "⏳ Awaiting"}
														</span>
													)}
												</div>
												<div className="prov-detail-item full-width">
													<span className="prov-detail-label">Comments</span>
													{isEditing ? (
														<input
															type="text"
															value={editComments}
															onChange={(e) => setEditComments(e.target.value)}
															placeholder="Add internal notes..."
														/>
													) : (
														<span className="prov-comments">{txn.comments || <em>No comments</em>}</span>
													)}
												</div>
											</div>

											<div className="prov-card-actions">
												{isEditing ? (
													<>
														<button
															className="prov-btn prov-btn-save"
															onClick={() => handleSave(txn.id)}
															disabled={saving}
														>
															{saving ? "Saving..." : "Save changes"}
														</button>
														<button
															className="prov-btn prov-btn-cancel"
															onClick={() => setEditingId(null)}
															disabled={saving}
														>
															Cancel
														</button>
													</>
												) : (
													<button className="prov-btn prov-btn-edit" onClick={() => handleEdit(txn)}>
														Edit
													</button>
												)}
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>

					{totalPages > 1 && (
						<div className="prov-pagination">
							<button
								className="page-btn"
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={page === 1}
							>
								← Prev
							</button>
							<div className="page-numbers">
								{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
									<button
										key={p}
										className={`page-num ${page === p ? "active" : ""}`}
										onClick={() => setPage(p)}
									>
										{p}
									</button>
								))}
							</div>
							<button
								className="page-btn"
								onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
								disabled={page === totalPages}
							>
								Next →
							</button>
							<span className="page-info">
								{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
							</span>
						</div>
					)}
				</>
			)}
		</div>
	);
}
