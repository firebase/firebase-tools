'use server'

import { headers } from 'next/headers';

export default async function SSR() {
    const headersList = headers();
    return <>SSR</>;
}
