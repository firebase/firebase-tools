import { useRouter } from "next/router";

export const getServerSideProps = async () => {
    return { props: { foo: 1 } };
}

export default function SSR() {
    const { locale } = useRouter();
    return <>SSR {locale}</>;
}
