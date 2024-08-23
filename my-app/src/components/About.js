import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPhone,faLocationCrosshairs ,faClock,} from '@fortawesome/free-solid-svg-icons'
function About() {
  return (
    <section className='about-container'>
    <div className='info'>
          <div className='rest-data'>
            <div>
                <FontAwesomeIcon icon={faPhone} style={{color: "#e1ac19",}} />
                <h6>000 (123) 456 7890</h6>
                <p>A small river named Duden flows</p>
            </div>
            <div>
                <FontAwesomeIcon icon={faLocationCrosshairs} style={{color: "#e1ac19",}} />
                <h6>198 West 21th Street</h6>
                <p>Suite 721 New York NY 10016</p>
            </div>
            <div>
                <FontAwesomeIcon icon={faClock} style={{color: "#e1ac19",}} />
                <h6>Open Monday-Friday</h6>
                <p>8:00am - 9:00pm</p>
              </div>
          </div>
          <div className='media'>
          <img src="./images/twitter.png"  className='social-icon' alt='media'/>
          <img src="./images/facebook.png" className='social-icon' alt='media'/>
          <img src="./images/instagram.png"className='social-icon' alt='media'/>
          </div>
        </div>
    <div className='about'>
        <img
          src="./images/about.jpg"
          alt="First slide"
        />
        <div className='about-content'>
            <h1>WELCOME TO <span> PIZZA </span>RESTAURANT</h1>
            <p>
                On her way she met a copy. The copy warned the Little Blind Text,
                that where it came from it would have been rewritten a thousand times
                and everything that was left from its origin would be the word "and" and
                the Little Blind Text should turn around and return to its own, safe country.
                But nothing the copy said could convince her and so it didn’t take long until a few
                insidious Copy Writers ambushed her, made her drunk with Longe and Parole and dragged
                herinto their agency, where they abused her for their.
            </p>
        </div>
    </div>
    </section>
  );
}

export default About;
