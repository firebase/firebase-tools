export const getServerSideProps = async () => {
    return { props: { foo: 1 } };
}

export default function SSR() {
    return <>SSR</>;
}
