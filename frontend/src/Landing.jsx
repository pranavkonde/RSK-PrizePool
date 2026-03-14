import React from "react";
import "./Landing.css";

export default function Landing({ onEnter }) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-logo">RSK Prize Pool</div>
        <button onClick={onEnter} className="btn btn-primary btn-nav">
          Launch App
        </button>
      </nav>

      <section className="landing-hero">
        <h1 className="landing-hero-title">
          Save. Earn. <span className="accent">Win.</span>
        </h1>
        <p className="landing-hero-subtitle">
          Gamified no-loss savings on Rootstock. Deposit rUSDT, earn yield, and win weekly prizes. Your principal stays safe — always.
        </p>
        <button onClick={onEnter} className="btn btn-primary btn-hero">
          Get Started
        </button>
      </section>

      <section className="landing-features">
        <h2 className="landing-section-title">How It Works</h2>
        <div className="landing-features-grid">
          <div className="landing-feature">
            <div className="landing-feature-icon">1</div>
            <h3>Deposit</h3>
            <p>Deposit rUSDT into the prize pool. Funds earn yield via Rootstock DeFi protocols.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">2</div>
            <h3>Earn & Compete</h3>
            <p>Your share of deposits = your odds. More deposited, higher chance to win.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">3</div>
            <h3>Win Weekly</h3>
            <p>One random depositor wins the entire prize pot each week. Withdraw anytime.</p>
          </div>
        </div>
      </section>

      <section className="landing-benefits">
        <div className="landing-benefit">
          <span className="landing-benefit-label">No Loss</span>
          <p>Principal is 100% safe and withdrawable at any time</p>
        </div>
        <div className="landing-benefit">
          <span className="landing-benefit-label">Weekly Prizes</span>
          <p>All accumulated yield awarded to one winner every week</p>
        </div>
        <div className="landing-benefit">
          <span className="landing-benefit-label">Bitcoin Secured</span>
          <p>Built on Rootstock- The Bitcoin DeFi Layer</p>
        </div>
      </section>

      <section className="landing-cta">
        <h2>Ready to start saving?</h2>
        <button onClick={onEnter} className="btn btn-primary btn-cta">
          Launch App
        </button>
      </section>

      <footer className="landing-footer">
        <p>RSK Prize Pool • Gamified No-Loss Savings on Rootstock</p>
      </footer>
    </div>
  );
}
