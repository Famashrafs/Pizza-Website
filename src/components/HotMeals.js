import React from 'react';
function CreateMealTop(props){
    return <div className='meal'>
        <div className='meal-image'>
        <img
            src={props.img}
            alt='meal'
        />
        </div>
        <div className='meal-content'>
            <h3>{props.title}</h3>
            <p>{props.desc}</p>
            <p>
                <span>{props.price}</span>
                <a href='index.html'>Order</a>
            </p>
        </div>
    </div>
}
function CreateMealBottom(props){
    return <div className='meal'>
        <div className='meal-content'>
            <h3>{props.title}</h3>
            <p>{props.desc}</p>
            <p>
                <span>{props.price}</span>
                <a href='index.html'>Order</a>
            </p>
        </div>
        <div className='meal-image'>
        <img
            src={props.img}
            alt='meal'
        />
        </div>
    </div>
}
function HotMeals() {
  return (
    <section className='hotMeals'>
        <div className='hotMeals-heading'>
            <h2>HOT PIZZA MEALS</h2>
            <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
        </div>
        <div className='meals-container'>
        <CreateMealTop 
            img="./images/pizza-1.jpg"
            title="Italian Pizza"
            desc="Far far away, behind the word mountains, far from the countries Vokalia and Consonantia"
            price="$2.90"
        />
        <CreateMealTop 
            img="./images/pizza-2.jpg"
            title="Greek Pizza"
            desc="Far far away, behind the word mountains, far from the countries Vokalia and Consonantia"
            price="$2.90"
        />
        <CreateMealTop 
            img="./images/pizza-3.jpg"
            title="Caucasian Pizza"
            desc="Far far away, behind the word mountains, far from the countries Vokalia and Consonantia"
            price="$2.90"
        />
        <CreateMealBottom 
            img="./images/pizza-4.jpg"
            title="American Pizza"
            desc="Far far away, behind the word mountains, far from the countries Vokalia and Consonantia"
            price="$2.90"
        />
        <CreateMealBottom 
            img="./images/pizza-5.jpg"
            title="Tomatoe Pie"
            desc="Far far away, behind the word mountains, far from the countries Vokalia and Consonantia"
            price="$2.90"
        />
        <CreateMealBottom 
            img="./images/pizza-6.jpg"
            title="Margherita"
            desc="Far far away, behind the word mountains, far from the countries Vokalia and Consonantia"
            price="$2.90"
        />
        </div>
    </section>
  );
}

export default HotMeals;