import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.css';
import './App.css';
import './admin.css';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { FavoritesProvider } from './context/FavoritesContext';
import NavBar from "./components/NavBar";
import CartDrawer from './components/CartDrawer';
import RequireAuth from './components/RequireAuth';
import Slider from "./components/Slider";
import About from './components/About';
import Services from './components/Services';
import HotMeals from './components/HotMeals';
import Menu from './components/Menu';
import Counter from './components/Counter';
import Blog from './components/Blog';
import Location from './components/Location';
import Footer from './components/Footer';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { ADMIN_ROLES } from './config/roles';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminComingSoon from './pages/admin/AdminComingSoon';
import OwnerRegister from './pages/owner/OwnerRegister';
import {
  faReceipt,
  faUtensils,
  faUsers,
  faTicket,
  faStar,
  faChartLine,
  faGear,
} from '@fortawesome/free-solid-svg-icons';

// Importing pages
import AboutPage from './pages/AboutPage';
import MenuPage from './pages/MenuPage';
import ServicesPage from './pages/ServicesPage';
import BlogPage from './pages/BlogPage';
import ContactPage from './pages/ContactPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Account from './pages/Account';
import OverviewPage from './pages/account/OverviewPage';
import ProfilePage from './pages/account/ProfilePage';
import SecurityPage from './pages/account/SecurityPage';
import PaymentsPage from './pages/account/PaymentsPage';
import AddressesPage from './pages/account/AddressesPage';
import OrdersSection from './pages/account/OrdersSection';
import FavoritesSection from './pages/account/FavoritesSection';
import SettingsPage from './pages/account/SettingsPage';
import Orders from './pages/Orders';
import OrderDetails from './pages/OrderDetails';
import Addresses from './pages/Addresses';
import Favorites from './pages/Favorites';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderConfirmation from './pages/OrderConfirmation';

// Public chrome (navbar, cart drawer, footer) is hidden inside the admin and
// owner-registration areas so the dashboard stays clean and focused.
function PublicTopChrome({ isScrolled }) {
  const location = useLocation();
  const hidden =
    location.pathname.startsWith('/admin') ||
    location.pathname === '/owner/register';

  if (hidden) return null;

  return (
    <>
      <NavBar isScrolled={isScrolled} />
      <CartDrawer />
    </>
  );
}

function PublicBottomChrome({ showMoveToTop, onMoveToTop }) {
  const location = useLocation();
  const hidden =
    location.pathname.startsWith('/admin') ||
    location.pathname === '/owner/register';

  if (hidden) return null;

  return (
    <>
      {showMoveToTop && (
        <button id="moveToTopBtn" title="Go to top" onClick={onMoveToTop}>
          TOP
        </button>
      )}
      <Footer />
    </>
  );
}

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
    <AuthProvider>
      <ToastProvider>
        <FavoritesProvider>
          <CartProvider>
            <Router>
              <PublicTopChrome isScrolled={isScrolled} />
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
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/account" element={
                  <RequireAuth title="Login to manage your profile">
                    <Account />
                  </RequireAuth>
                }>
                  <Route index element={<OverviewPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="security" element={<SecurityPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="addresses" element={<AddressesPage />} />
                  <Route path="orders" element={<OrdersSection />} />
                  <Route path="favorites" element={<FavoritesSection />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
                <Route path="/orders" element={
                  <RequireAuth title="Login to view your orders">
                    <Orders />
                  </RequireAuth>
                } />
                <Route path="/orders/:id" element={
                  <RequireAuth title="Login to track your order">
                    <OrderDetails />
                  </RequireAuth>
                } />
                <Route path="/addresses" element={
                  <RequireAuth title="Login to manage addresses">
                    <Addresses />
                  </RequireAuth>
                } />
                <Route path="/favorites" element={
                  <RequireAuth title="Login to see your favorites">
                    <Favorites />
                  </RequireAuth>
                } />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/order-confirmation" element={<OrderConfirmation />} />

                <Route path="/owner/register" element={<OwnerRegister />} />

                <Route
                  path="/admin"
                  element={
                    <RoleProtectedRoute roles={ADMIN_ROLES}>
                      <AdminLayout />
                    </RoleProtectedRoute>
                  }
                >
                  <Route index element={<AdminDashboard />} />
                  <Route
                    path="orders"
                    element={
                      <AdminComingSoon
                        icon={faReceipt}
                        title="Orders"
                        description="Track, update and manage every order — from placed to delivered. This section will be built in the next phase."
                      />
                    }
                  />
                  <Route
                    path="menu"
                    element={
                      <AdminComingSoon
                        icon={faUtensils}
                        title="Menu"
                        description="Add, edit, price and organize your menu items and categories. This section will be built in the next phase."
                      />
                    }
                  />
                  <Route
                    path="customers"
                    element={
                      <AdminComingSoon
                        icon={faUsers}
                        title="Customers"
                        description="View your customer base, order history and profiles. This section will be built in the next phase."
                      />
                    }
                  />
                  <Route
                    path="coupons"
                    element={
                      <AdminComingSoon
                        icon={faTicket}
                        title="Coupons"
                        description="Create and manage discount codes and promotions. This section will be built in the next phase."
                      />
                    }
                  />
                  <Route
                    path="reviews"
                    element={
                      <AdminComingSoon
                        icon={faStar}
                        title="Reviews"
                        description="Read and respond to customer reviews. This section will be built in the next phase."
                      />
                    }
                  />
                  <Route
                    path="analytics"
                    element={
                      <AdminComingSoon
                        icon={faChartLine}
                        title="Analytics"
                        description="Deep insights into sales, products and customers. This section will be built in the next phase."
                      />
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <AdminComingSoon
                        icon={faGear}
                        title="Restaurant Settings"
                        description="Hours, delivery settings, location and billing. This section will be built in the next phase."
                      />
                    }
                  />
                </Route>
              </Routes>
              <PublicBottomChrome
                showMoveToTop={showMoveToTop}
                onMoveToTop={scrollToTop}
              />
            </Router>
          </CartProvider>
        </FavoritesProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
