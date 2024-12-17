import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMessage} from '@fortawesome/free-solid-svg-icons'

function BlogContainer(props){
    return (
        <>
            <div className="content-container">
                    <div className='blog-info'>
                        <img className='blog-img' src={props.image} alt=''/>
                        <p>Sept 10, 2018</p>
                        <p>Admin</p>
                        <FontAwesomeIcon icon={faMessage} className='icon' />
                        <p>3</p>
                    </div>
                    <h4>The Delicious Pizza</h4>
                    <p>
                    A small river named Duden flows by their place and supplies it with the necessary regelialia.
                    </p>
                
            </div>
        </>
    )
}
export default BlogContainer