import React from 'react';
function Location(props){
    return(
        <div className='location'>
        <iframe width="770" height="510" id="gmap_canvas" src="https://maps.google.com/maps?q=california&t=&z=10&ie=UTF8&iwloc=&output=embed" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" title='map'></iframe>
        <div className='contact'>

        </div>
        <form>
            <h2>Contact Us</h2>
            <input type='text' placeholder='first name'/>
            <input type='text' placeholder='last name'/>
            <textarea placeholder='message'/>
            <input type='submit' className='contact-btn'/>
        </form>
        </div>
    );
}
export default Location