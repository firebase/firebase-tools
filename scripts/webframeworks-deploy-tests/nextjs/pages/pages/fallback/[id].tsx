import { useRouter } from "next/router";

export const getStaticPaths = async () => {
    return { 
        paths: [
            { params: { id: '1' }, locale: 'en' },
            { params: { id: '2' }, locale: 'en' },
            { params: { id: '1' }, locale: 'fr' },
            { params: { id: '2' }, locale: 'fr' },
        ],
        fallback: true,
    };
}

export const getStaticProps = async () => {
    return { props: { } };
}

export default function SSG() {
    const { locale, query: { id }} = useRouter();
    return <>SSG {id} {locale}</>;
}
