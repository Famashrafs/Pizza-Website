import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCarrot,faPersonBiking ,faPizzaSlice} from '@fortawesome/free-solid-svg-icons'

function Services() {
  return (
    <section className='services'>
        <div className='container'>
        <div className='service-heading'>
            <h2>OUR SERVICES</h2>
            <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
        </div>
        <div className='servies-content'>
            <div>
                <FontAwesomeIcon icon={faCarrot} className='icon' /> 
                <h2>HEALTHY FOODS</h2>
                <p>
                Even the all-powerful Pointing has no control about the blind texts it is an almost unorthographic.
                </p>
            </div>
            <div>
            <FontAwesomeIcon icon={faPersonBiking}  className='icon' /> 
                <h2>FASTEST DELIVERY</h2>
                <p>
                Even the all-powerful Pointing has no control about the blind texts it is an almost unorthographic.
                </p>
            </div>
            <div>
                <FontAwesomeIcon icon={faPizzaSlice}  className='icon' /> 
                <h2>ORIGINAL RECIPES</h2>
                <p>
                Even the all-powerful Pointing has no control about the blind texts it is an almost unorthographic.
                </p>
            </div>
        </div>
        </div>
    </section>
  );
}

export default Services;
