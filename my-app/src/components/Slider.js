import Carousel from 'react-bootstrap/Carousel';

function Slider() {
  return (
    <Carousel className='landing' fade>
      <Carousel.Item className='slide-1'>
        <img
          className="d-block slider-img"
          src="./images/slide-1.jpg"
          alt="First slide"
        />
        <Carousel.Caption>
          <div className='slider-content'>
          <p className='subheading'>Delicious</p>
          <h1>ITALIAN CUIZINE</h1>
          <p>"A small river named Duden flows by their place and supplies it with the necessary regelialia."</p>
          <div className='slider-btns'>
            <a href='index.html' className='order-btn'> order now</a>
            <a href='index.html' className='menu-btn'> view menu</a>
          </div>
          </div>
          <img src='./images/bg_1.png' alt='pizza'/>
        </Carousel.Caption>
      </Carousel.Item>
      <Carousel.Item className='slide-2'>
        <img
          className="d-block slider-img"
          src="./images/slide-1.jpg"
          alt="Second slide"
        />

        <Carousel.Caption>
          <img src='./images/bg_2.png' alt='pizza'/>
          <div className='slider-content'>
          <p className='subheading'>Crunchy</p>
          <h1>ITALIAN PIZZA</h1>
          <p>"A small river named Duden flows by their place and supplies it with the necessary regelialia."</p>
          <div className='slider-btns'>
            <a href='index.html' className='order-btn'> order now</a>
            <a href='index.html' className='menu-btn'> view menu</a>
          </div>
          </div>
        </Carousel.Caption>
      </Carousel.Item>
      <Carousel.Item className='slide-3'>
        <img
          className="d-block slider-img"
          src="./images/bg_3.jpg"
          alt="Third slide"
        />

        <Carousel.Caption>
        <div className='slider-content'>
          <p className='subheading'>Welcome</p>
          <h1>WE COOKED YOUR DESIRED PIZZA RECIPE</h1>
          <p>"A small river named Duden flows by their place and supplies it with the necessary regelialia."</p>
          <div className='slider-btns'>
            <a href='index.html' className='order-btn'> order now</a>
            <a href='index.html' className='menu-btn'> view menu</a>
          </div>
          </div>
        </Carousel.Caption>
      </Carousel.Item>
    </Carousel>
  );
}

export default Slider;