import { OversightLayout } from '@/components/dashboard/oversight/oversight-layout';

export default function Layout({ children }: { children: React.ReactNode }) {
    return <OversightLayout>{children}</OversightLayout>;
}
