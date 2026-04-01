import { useState } from 'react'
import './App.css'
import { useAuth, Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'
import CheckoutButton from './components/CheckoutButton'

function App() {
  const [data, setData] = useState(null);
  const { getToken } = useAuth();

  async function testApi() {
    try {
      const token = await getToken();
      const res = await fetch("https://worker.senew2208.workers.dev", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error calling worker: ", err);
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1 className="logo">MyApp</h1>
          <nav className="auth-nav">
            <Show when="signed-out">
              <SignInButton mode="modal" />
              <SignUpButton mode="modal" />
            </Show>
            <Show when="signed-in">
              <div className="user-info">
                {data && (
                  <div className="user-details">
                    <span className="user-email">{data.email || data.userId}</span>
                  </div>
                )}
                <UserButton />
              </div>
            </Show>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <Show when="signed-out">
          <section className="hero">
            <h2>Welcome to MyApp</h2>
            <p>Get started with our service today</p>
            <div className="cta-buttons">
              <SignUpButton mode="modal">
                <button className="btn btn-primary">Sign Up</button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button className="btn btn-secondary">Sign In</button>
              </SignInButton>
            </div>
          </section>
        </Show>

        <Show when="signed-in">
          <section className="dashboard">
            <div className="product-card">
              <div className="card-header">
                <h2>Premium Product</h2>
                <p className="card-description">Access our premium features</p>
              </div>

              <div className="card-features">
                <ul>
                  <li>All premium features</li>
                  <li>Priority support</li>
                  <li>Advanced analytics</li>
                </ul>
              </div>

              <div className="card-footer">
                <div className="price">
                  <span className="amount">$100</span>
                  <span className="period">one-time</span>
                </div>
                <CheckoutButton priceId="price_1THIBCRBIrAzqMIj8PEyg1Qk" />
              </div>
            </div>

            <div className="debug-section">
              <button onClick={testApi} className="debug-btn">Test Auth (Call API)</button>
              {data && (
                <div className="debug-output">
                  <h3>API Response:</h3>
                  <pre>{JSON.stringify(data, null, 2)}</pre>
                </div>
              )}
            </div>
          </section>
        </Show>
      </main>
    </div>
  )
}

export default App
