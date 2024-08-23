import About from "../components/About"
import Chefs from "../components/Chefs"
import Counter from "../components/Counter"
function AboutPage(){
    return (
        <>
            <div className="landing-page">
                <h1 className='landing-title'>ABOUT US</h1>
            </div>
            <About />
            <Chefs />        
            <Counter />    
        </>
    )
}
export default AboutPage