export const getStaticProps = async () => {
    return { props: { }, revalidate: 10 };
}

export default function ISR() {
    return <>ISR</>;
}
