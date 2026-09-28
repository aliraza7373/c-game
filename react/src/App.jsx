import { Routes, Route, useLocation } from 'react-router-dom';
import Login from './Login';
import Home from './Home';
import BoatGame from './BoatGame';
import OceanBackground from './OceanBackground';
import './App.css';

function App() {
  const location = useLocation();
  const isGameRoute = location.pathname === '/' || location.pathname === '/game';

  return (
    <div className="app-container">
      {/* Background ocean only on non-game pages (like login and dashboard) to avoid duplicate WebGL scenes */}
      {!isGameRoute && <OceanBackground />}
      <Routes>
        <Route path="/" element={<BoatGame />} />
        <Route path="/game" element={<BoatGame />} />
        <Route path="/home" element={<Home />} />
        <Route path="/dashboard" element={<Home />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </div>
  );
}

export default App;
