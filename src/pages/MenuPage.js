import React, { useState } from 'react';
import HotMeals from '../components/HotMeals';
import Menu from '../components/Menu';

function MenuPage() {
  const [activeTab, setActiveTab] = useState('Pizza');

  const handleTabClick = (tab) => {
    setActiveTab(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Pizza':
        return (
          <div className="menu-content">
            <div className="cards">
              <div className="card">
                <img src="../images/pizza-1.jpg" alt="Pizza 1" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/pizza-2.jpg" alt="Pizza 2" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/pizza-8.jpg" alt="Pizza 3" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
            </div>
          </div>
        );
      case 'Drinks':
        return (
          <div className="menu-content">
            <div className="cards">
              <div className="card">
                <img src="../images/drink-1.jpg" alt="Drink 1" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/drink-2.jpg" alt="Drink 2" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/drink-3.jpg" alt="Drink 3" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
            </div>
          </div>
        );
      case 'Burger':
        return (
          <div className="menu-content">
            <div className="cards">
              <div className="card">
                <img src="../images/burger-1.jpg" alt="Burger 1" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/burger-2.jpg" alt="Burger 2" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/burger-3.jpg" alt="Burger 3" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
            </div>
          </div>
        );
      case 'Pasta':
        return (
          <div className="menu-content">
            <div className="cards">
              <div className="card">
                <img src="../images/pasta-1.jpg" alt="Pasta 1" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/pasta-2.jpg" alt="Pasta 2" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
              <div className="card">
                <img src="../images/pasta-3.jpg" alt="Pasta 3" />
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia.</p>
                <p className = "price"> $2,50</p>
                <button>Order Now</button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
        <div className="landing-page">
                <h1 className='landing-title'>OUR MENU</h1>
        </div>
            <h1 style={{textAlign:"center",marginTop:"40px",color:"#fac564"}}>OUR MENU</h1>
            <p style={{textAlign:"center",color:"#808080"}}>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
        <div className='menu'>
            <nav className="menu-tabs">
                <button
                className={activeTab === 'Pizza' ? 'active' : ''}
                onClick={() => handleTabClick('Pizza')}
                >
                Pizza
                </button>
                <button
                className={activeTab === 'Drinks' ? 'active' : ''}
                onClick={() => handleTabClick('Drinks')}
                >
                Drinks
                </button>
                <button
                className={activeTab === 'Burger' ? 'active' : ''}
                onClick={() => handleTabClick('Burger')}
                >
                Burger
                </button>
                <button
                className={activeTab === 'Pasta' ? 'active' : ''}
                onClick={() => handleTabClick('Pasta')}
                >
                Pasta
                </button>
            </nav>
        <div className="tab-content">
        {renderContent()}
        </div>
        </div>
        <HotMeals />
        <Menu />
    </>
  );
}

export default MenuPage;
