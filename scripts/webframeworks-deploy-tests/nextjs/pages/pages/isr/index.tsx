import { useRouter } from "next/router";

export const getStaticProps = async () => {
    return { props: { }, revalidate: 10 };
}

export default function ISR() {
    const { locale } = useRouter();
    return <>ISR { locale }</>;
}
