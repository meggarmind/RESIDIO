import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Extract params from query
        const visitorName = searchParams.get('visitorName')?.slice(0, 100) || 'Visitor';
        const accessCode = searchParams.get('code') || '----';
        const validUntil = searchParams.get('valid') || 'Today';
        const estateName = searchParams.get('estate') || 'Residio Estate';

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#fff',
                        fontFamily: 'sans-serif',
                    }}
                >
                    {/* Background Pattern */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            opacity: 0.1,
                            backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                            backgroundSize: '20px 20px',
                        }}
                    />

                    {/* Card */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            backgroundColor: 'white',
                            borderRadius: '24px',
                            padding: '40px 60px',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                            border: '1px solid #eaeaea',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                            <span style={{ fontSize: 24, fontWeight: 600, color: '#666' }}>{estateName}</span>
                        </div>

                        <div style={{ fontSize: 18, color: '#888', marginBottom: '8px' }}>VISITOR PASS FOR</div>
                        <div style={{ fontSize: 42, fontWeight: 800, color: '#111', marginBottom: '32px', textAlign: 'center' }}>
                            {visitorName}
                        </div>

                        {/* Access Code */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                backgroundColor: '#f5f5f5',
                                padding: '24px 48px',
                                borderRadius: '16px',
                                border: '2px dashed #ddd',
                                marginBottom: '32px',
                            }}
                        >
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#666', marginBottom: '4px' }}>ACCESS CODE</div>
                            <div style={{ fontSize: 64, fontWeight: 900, color: '#000', letterSpacing: '-2px' }}>
                                {accessCode}
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: 16, color: '#444' }}>
                                Valid Until: <span style={{ fontWeight: 700 }}>{validUntil}</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ position: 'absolute', bottom: 40, display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: 16, color: '#888', fontWeight: 500 }}>Secured by Residio</span>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            },
        );
    } catch (e: any) {
        console.log(`${e.message}`);
        return new Response(`Failed to generate the image`, {
            status: 500,
        });
    }
}
