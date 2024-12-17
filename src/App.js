import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.css';
import './App.css';
import NavBar from "./components/NavBar";
import Slider from "./components/Slider";
import About from './components/About';
import Services from './components/Services';
import HotMeals from './components/HotMeals';
import Menu from './components/Menu';
import Counter from './components/Counter';
import Blog from './components/Blog';
import Location from './components/Location';
import Footer from './components/Footer';

// Importing pages
import AboutPage from './pages/AboutPage';
import MenuPage from './pages/MenuPage';
import ServicesPage from './pages/ServicesPage';
import BlogPage from './pages/BlogPage';
import ContactPage from './pages/ContactPage';

function App() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showMoveToTop, setShowMoveToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const landingSection = document.querySelector('.landing');
      if (landingSection) {
        const landingHeight = landingSection.offsetHeight;
        if (window.pageYOffset >= landingHeight) {
          setIsScrolled(true);
          setShowMoveToTop(true);
        } else {
          setIsScrolled(false);
          setShowMoveToTop(false);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Router>
      <NavBar isScrolled={isScrolled} />
      <Routes>
        <Route path="/" element={
          <>
            <div className="landing">
              <Slider />
            </div>
            <About />
            <Services />
            <HotMeals />
            <Menu />
            <Counter />
            <Blog />
            <Location />
          </>
        } />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/contact" element={<ContactPage />} />
      </Routes>
      {showMoveToTop && (
        <button id="moveToTopBtn" title="Go to top" onClick={scrollToTop}>
          TOP
        </button>
      )}
      <Footer />
    </Router>
  );
}

export default App;
