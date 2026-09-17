import React from 'react';
import { useCart } from '../context/CartContext';
function CreateMealTop({ img, title, desc, price, onOrder }) {
    return <div className='meal'>
        <div className='meal-image'>
        <img
            src={img}
            alt='meal'
        />
        </div>
        <div className='meal-content'>
            <h3>{title}</h3>
            <p>{desc}</p>
            <p>
                <span>{price}</span>
                <a href="#!" onClick={onOrder}>Order</a>
            </p>
        </div>
    </div>
}
function CreateMealBottom({ img, title, desc, price, onOrder }) {
    return <div className='meal'>
        <div className='meal-content'>
            <h3>{title}</h3>
            <p>{desc}</p>
            <p>
                <span>{price}</span>
                <a href="#!" onClick={onOrder}>Order</a>
            </p>
        </div>
        <div className='meal-image'>
        <img
            src={img}
            alt='meal'
        />
        </div>
    </div>
}
function HotMeals() {
    const { addItem } = useCart();
    const meals = [
        { id: 'pizza-1', img: './images/pizza-1.jpg', title: 'Italian Pizza', desc: 'Far far away, behind the word mountains, far from the countries Vokalia and Consonantia', price: '$2.90' },
        { id: 'pizza-2', img: './images/pizza-2.jpg', title: 'Greek Pizza', desc: 'Far far away, behind the word mountains, far from the countries Vokalia and Consonantia', price: '$2.90' },
        { id: 'pizza-3', img: './images/pizza-3.jpg', title: 'Caucasian Pizza', desc: 'Far far away, behind the word mountains, far from the countries Vokalia and Consonantia', price: '$2.90' },
        { id: 'pizza-4', img: './images/pizza-4.jpg', title: 'American Pizza', desc: 'Far far away, behind the word mountains, far from the countries Vokalia and Consonantia', price: '$2.90' },
        { id: 'pizza-5', img: './images/pizza-5.jpg', title: 'Tomatoe Pie', desc: 'Far far away, behind the word mountains, far from the countries Vokalia and Consonantia', price: '$2.90' },
        { id: 'pizza-6', img: './images/pizza-6.jpg', title: 'Margherita', desc: 'Far far away, behind the word mountains, far from the countries Vokalia and Consonantia', price: '$2.90' },
    ];
  return (
    <section className='hotMeals'>
        <div className='hotMeals-heading'>
            <h2>HOT PIZZA MEALS</h2>
            <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
        </div>
        <div className='meals-container'>
        {meals.map((meal, index) => {
            const Component = index < 3 ? CreateMealTop : CreateMealBottom;
            const fullItem = {
                id: meal.id,
                name: meal.title,
                price: 2.90,
                image: meal.img,
                desc: meal.desc,
            };
            return (
                <Component
                    key={meal.id}
                    img={meal.img}
                    title={meal.title}
                    desc={meal.desc}
                    price={meal.price}
                    onOrder={(e) => { e.preventDefault(); addItem(fullItem); }}
                />
            );
        })}
        </div>
    </section>
  );
}

export default HotMeals;