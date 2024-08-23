import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPhone,faLocationCrosshairs ,faClock,faMessage} from '@fortawesome/free-solid-svg-icons'

function Footer() {
return (
    <footer>
        <div className='ft-aboutUs'>
        <h5>ABOUT US</h5>
        <p>
            Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.
        </p>
        </div>
        <div className=' ft-recentBlog'>
        <h5>RECENT BLOG</h5>
        <div className='recentBlog-content'>
            <img src='./images/image_1.jpg' alt='blog'/>
            <div className='blog-title'>
                <h4>Even the all-powerful Pointing has no control about</h4>
                <div className='blog-info'>
                    <p>Sept 10, 2018</p>
                    <p>Admin</p>
                    <FontAwesomeIcon icon={faMessage} className='icon' />
                    <p>3</p>
                </div>
            </div>
        </div>
        <div className='recentBlog-content'>
            <img src='./images/image_2.jpg' alt='blog'/>
            <div className='blog-title'>
                <h4>Even the all-powerful Pointing has no control about</h4>
                <div className='blog-info'>
                    <p>Sept 10, 2018</p>
                    <p>Admin</p>
                    <FontAwesomeIcon icon={faMessage} className='icon' />
                    <p>3</p>
                </div>
            </div>
        </div>
        </div>
        <div className='ft-services'>
        <h5>SERVICES</h5>
        <p>Deliver</p>
        <p>Cooked</p>
        <p>Quality Foods</p>
        <p>Mixed</p>
        </div>
        <div className='ft-question'>
        <h5>HAVE A QUESTION ?</h5>
        <div>
            <FontAwesomeIcon className='icon' icon={faLocationCrosshairs} style={{color: "#e1ac19",marginBottom:"20px",marginRight:"10px",}} />
            <p>203 Fake St. Mountain View, San Francisco, California, USA</p>
        </div>
        <div>
            <FontAwesomeIcon className='icon' icon={faPhone} style={{color: "#e1ac19",marginBottom:"20px",marginRight:"10px",}} /> 
            <p>+2 392 3929 210</p>
        </div>
        <div>
            <FontAwesomeIcon className='icon' icon={faClock} style={{color: "#e1ac19",marginBottom:"20px",marginRight:"10px",}} />
            <p>info@yourdomain.com</p>
        </div>
        </div>
        <div className='copy-write'>made with love by FAM ASHRAF</div>
    </footer>
)

}
export default Footer;