import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPhone,faLocationCrosshairs ,faClock} from '@fortawesome/free-solid-svg-icons'

function CounterMaker(props) {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCounter((counter) =>{if (counter < props.number){  return counter + 1} else { return counter}});
    }, props.speed);
     
    return () => {
      clearInterval(interval);
    };
  }, [props.number,props.speed]);

  return (
        <div className="counter">
            <FontAwesomeIcon className="counter-icon" icon={props.icon} style={{color: "#e1ac19",}} />
            {counter}
            <p>{props.title}</p>
        </div>
    );
}

function Counter(){
  return(
    <div className="counters">
      <CounterMaker 
        number={100}
        icon={faClock}
        title="pizza branches"
        speed={100}
      />
      <CounterMaker 
        number={85}
        icon={faLocationCrosshairs}
        title="Number of Awards"
        speed={500}
      />
      <CounterMaker 
        number={10000}
        icon={faPhone}
        title="Happy customer"
        speed={0.001}
      />
      <CounterMaker 
        number={100}
        icon={faLocationCrosshairs}
        title="Staff"
        speed={500}
      />
    </div>
  )
}
export default Counter;