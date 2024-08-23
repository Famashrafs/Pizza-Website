function ChefCard(props){
    return (
        <div className="chef-card">
            <img className="chef-card-img" src={props.image} alt="" />
            <h5>{props.name}</h5>
            <p className="specialty">{props.specialty}</p>
            <p className="description">Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
        </div>
    )
}
function Chefs(){
    return (
        <>
            <div className="chefs">
                <h1>OUR CHEF</h1>
                <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
                <div className="chef-card-container">
                    <ChefCard
                        image = "./images/person_1.jpg"
                        name = "Tom Smith"
                        specialty = "Hair Specialist"
                        />
                    <ChefCard
                        image = "./images/person_2.jpg"
                        name = "Mark Wilson"
                        specialty = "Beard Specialist"
                        />
                    <ChefCard
                        image = "./images/person_3.jpg"
                        name = "Patrick Jacobson"
                        specialty = "Hair Stylist"
                    />
                    <ChefCard
                        image = "./images/person_4.jpg"
                        name = "Ivan Dorchsner"
                        specialty = "Beard Specialist"
                        />
                </div>
            </div>   
        </>
    )
}
export default Chefs