import React from 'react';
function CreateMenu(props){
    return(
        <div className='menu-meals'>
            <div>
            <img
                src={props.img}
                alt='meal'
            />
            <h5>{props.title}</h5>
            <span className='dashed'></span>
            <span>{props.price}</span>
            </div>
            <p>{props.desc}</p>
        </div>
    )
}
function Menu() {
  return (
    <div className='menu'>
        <div className='menu-heading'>
            <h2>OUR MENU PRICING</h2>
            <div className='shape'>
            <span className='shape-1'></span>
            <span className='shape-2'></span>
            <span className='shape-3'></span>
            </div>
            <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
        </div>
        <div className='menu-content'>
            <div className='container'>
            <div className='row'>
            <div className='col-md-6'>
            <CreateMenu
                img="./images/pizza-1.jpg"
                title="Italian Pizza"
                price="$20.00"
                desc="A small river named Duden flows by their place and supplies"
            />
            <CreateMenu
                img="./images/pizza-2.jpg"
                title="Hawaiian Pizza"
                price="$29.00"
                desc="A small river named Duden flows by their place and supplies"
            />
            <CreateMenu
                img="./images/pizza-3.jpg"
                title="Greek Pizza"
                price="$20.00"
                desc="A small river named Duden flows by their place and supplies"
            />
            <CreateMenu
                img="./images/pizza-4.jpg"
                title="Bacon Crispy Thins"
                price="$20.00"
                desc="A small river named Duden flows by their place and supplies"
            />
             </div>
            
            <div className='col-md-6'>
            <CreateMenu
                img="./images/pizza-5.jpg"
                title="Hawaiian Special"
                price="$49.91"
                desc="A small river named Duden flows by their place and supplies"
            />
            <CreateMenu
                img="./images/pizza-6.jpg"
                title="Ultimate Overload"
                price="$20.00"
                desc="A small river named Duden flows by their place and supplies"
            />
            <CreateMenu
                img="./images/pizza-7.jpg"
                title="Bacon Pizza"
                price="$20.00"
                desc="A small river named Duden flows by their place and supplies"
            />
            <CreateMenu
                img="./images/pizza-8.jpg"
                title="Ham & Pineapple"
                price="$20.00"
                desc="A small river named Duden flows by their place and supplies"
            />
            </div>
            </div>
        </div>
        </div>
    </div>
  );
}

export default Menu;
