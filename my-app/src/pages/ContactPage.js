function ContactPage(){
    return (
        <>
            <div className="landing-page">
                <h1 className='landing-title'>Contact US</h1>
            </div>
            <div className="contact-section">
                <div className="contact-section-info">
                    <h3>Contact Information</h3>
                    <p>Address</p>
                    <p className="info" > 198 West 21th Street, Suite 721 New York NY 10016</p>
                    <p>Phone</p>
                    <p className="info" >  + 1235 2355 98</p>
                    <p>Email</p>
                    <p className="info" > info@yoursite.com</p>
                    <p>Website</p>
                    <p className="info" >  yoursite.com</p>
                </div>
                <form className="contact-form">
                    <input type="text" placeholder="Your name" />
                    <input type="email" placeholder="Email" />
                    <input type="text" placeholder="subject" />
                    <textarea placeholder="message" />
                    <input type="submit" />
                </form>
            </div>
        </>
    )
}
export default ContactPage