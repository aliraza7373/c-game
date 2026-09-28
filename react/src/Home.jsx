import { useState } from "react";
import { useNavigate } from "react-router-dom";

function TideMark() {
  return (
    <svg viewBox="0 0 42 42" aria-hidden="true" className="tide-mark">
      <path d="M5 24c4.8-7 9.6-7 14.4 0s9.6 7 17.6 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
      <path d="M5 16c4.8-7 9.6-7 14.4 0s9.6 7 17.6 0" fill="none" opacity=".55" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function Home() {
  const [counter, setCounter] = useState(0);
  const navigate = useNavigate();

  const decrease = () => setCounter((current) => Math.max(0, current - 1));
  const increase = () => setCounter((current) => current + 1);

  return (
    <div className="tide-app">

      <header className="topbar">
        <button className="brand" type="button" onClick={() => setCounter(0)} aria-label="Reset Tide dashboard">
          <span className="brand-mark"><TideMark /></span>
          <span>TIDE</span>
        </button>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#today">Today</a>
          <a href="#rhythm">Rhythm</a>
          <button className="nav-boat-btn" type="button" onClick={() => navigate("/")}>
            ⚓ Take the Helm
          </button>
        </nav>
        <button className="logout-button" type="button" onClick={() => navigate("/login")}>
          Sign out
          <ArrowIcon />
        </button>
      </header>

      <main className="dashboard">
        <section className="hero-copy" aria-labelledby="page-title">
          <p className="eyebrow"><span /> Your personal current</p>
          <h1 id="page-title">Find your flow<br />one wave at a time.</h1>
          <p className="hero-text">A quiet space to keep your momentum visible, celebrate each small step, and let the rest drift away.</p>
          <div className="hero-actions">
            <button className="hero-voyage-btn" type="button" onClick={() => navigate("/")}>
              <span>Sail 3D Boat Game</span>
              <ArrowIcon />
            </button>
            <a className="discover-link" href="#today">See today&apos;s tide <ArrowIcon /></a>
          </div>
        </section>

        <section className="feature-area" id="today" aria-label="Today’s progress">
          <article className="focus-card">
            <div className="card-topline">
              <div>
                <p className="card-kicker">TODAY&apos;S RHYTHM</p>
                <h2>Keep the current going</h2>
              </div>
              <div className="live-status"><span /> In flow</div>
            </div>

            <div className="metric-row">
              <div className="metric-copy">
                <p>Focused moments</p>
                <strong>{String(counter).padStart(2, "0")}</strong>
                <span>small wins collected</span>
              </div>
              <div className="mini-tide" aria-hidden="true"><i /><i /><i /><i /></div>
            </div>

            <div className="counter-controls" aria-label="Focused moments controls">
              <button type="button" className="round-control" onClick={decrease} aria-label="Remove one focused moment">−</button>
              <button type="button" className="add-moment" onClick={increase}><span>Mark a moment</span><b>+</b></button>
              <button type="button" className="reset-control" onClick={() => setCounter(0)}>Reset</button>
            </div>
          </article>

          <div className="feature-notes" id="rhythm">
            <div><span className="note-icon note-icon--sun">✦</span><p><b>Move gently</b> Progress has its own tide.</p></div>
            <div><span className="note-icon note-icon--wave">≈</span><p><b>Stay present</b> One clear moment is enough.</p></div>
          </div>
        </section>
      </main>

      <footer className="scene-caption"><span /> The water is always moving <span>•</span> Take it at your pace</footer>
    </div>
  );
}

export default Home;
