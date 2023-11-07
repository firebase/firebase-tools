import Image from 'next/image'

export default function PageWithImage() {
  return <Image 
      src="https://www.google.com/logos/doodles/2015/googles-new-logo-5078286822539264.3-hp2x.gif"
      alt=""
      width={300} 
      height={300}
    />;
}