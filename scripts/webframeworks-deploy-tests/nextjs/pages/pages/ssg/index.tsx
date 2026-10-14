import { useRouter } from "next/router";

export const getStaticProps = async () => {
    return { props: { } };
}

export default function SSG() {
    const { locale } = useRouter();
    return <>SSG { locale }</>;
}
