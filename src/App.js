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
import Footer from './components/Footer';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { ADMIN_ROLES } from './config/roles';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminComingSoon from './pages/admin/AdminComingSoon';
import AdminMenu from './pages/admin/AdminMenu';
import AdminProductForm from './pages/admin/AdminProductForm';
import CategoryManager from './pages/admin/CategoryManager';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOrderDetails from './pages/admin/AdminOrderDetails';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminCustomerDetails from './pages/admin/AdminCustomerDetails';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminSettings from './pages/admin/AdminSettings';
import OwnerRegister from './pages/owner/OwnerRegister';
import { faTicket, faStar } from '@fortawesome/free-solid-svg-icons';

// Importing pages
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import OffersPage from './pages/OffersPage';
import MenuPage from './pages/MenuPage';
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
    // The storefront has a sticky nav and a back-to-top button; both appear
    // once the page has scrolled past the hero. A fixed threshold keeps this
    // working on every page without depending on a hero element's height.
    const isPastHero = () => window.pageYOffset > 120;

    const handleScroll = () => {
      const scrolled = isPastHero();
      setIsScrolled(scrolled);
      setShowMoveToTop(scrolled);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
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
                <Route path="/" element={<HomePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/offers" element={<OffersPage />} />
                <Route path="/menu" element={<MenuPage />} />
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

                {/* Admin auth entry points (must sit outside the guarded
                    /admin route so they stay reachable when signed out). */}
                <Route path="/admin/login" element={<Login adminMode />} />
                <Route
                  path="/admin/register"
                  element={<OwnerRegister adminMode />}
                />

                <Route
                  path="/admin"
                  element={
                    <RoleProtectedRoute roles={ADMIN_ROLES}>
                      <AdminLayout />
                    </RoleProtectedRoute>
                  }
                >
                  <Route index element={<AdminDashboard />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="orders/:id" element={<AdminOrderDetails />} />
                  <Route path="menu" element={<AdminMenu />} />
                  <Route path="menu/new" element={<AdminProductForm />} />
                  <Route path="menu/categories" element={<CategoryManager />} />
                  <Route path="menu/:id/edit" element={<AdminProductForm />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="customers/:id" element={<AdminCustomerDetails />} />
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
                  <Route path="analytics" element={<AdminAnalytics />} />
                  <Route path="settings" element={<AdminSettings />} />
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
