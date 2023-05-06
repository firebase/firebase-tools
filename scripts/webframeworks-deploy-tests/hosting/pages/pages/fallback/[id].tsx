export const getStaticPaths = async () => {
    return { 
        paths: [{ params: { id: '1' } }, { params: { id: '2' } }],
        fallback: true,
    };
}

export const getStaticProps = async () => {
    return { props: { } };
}

export default function SSG() {
    return <>SSG</>;
}
