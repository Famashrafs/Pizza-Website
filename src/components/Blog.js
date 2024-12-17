import React from 'react';
import BlogContainer from './BlogContainer';
function Blog() {
  return (
    <section className='blog'>
        <div className='container'>
        <div className='blog-heading'>
            <h2>RECENT FROM BLOG</h2>
            <p>Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts.</p>
        </div>
        <div className='blog-content'>
            <BlogContainer
                image="./images/image_1.jpg"
            />
            <BlogContainer
                image="./images/image_2.jpg"
            />
            <BlogContainer
                image="./images/image_3.jpg"
            />
        </div>
        </div>
    </section>
  );
}

export default Blog;
