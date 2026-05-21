import { describe, expect, it } from 'vitest';
import {
  HikingUrlIngestionError,
  ingestHikingAppUrl,
  isSupportedHikingAppUrl
} from './hiking-url';

describe('ingestHikingAppUrl', () => {
  it('imports a public Komoot URL through its coordinates endpoint', async () => {
    const fetch = mockFetch({
      'https://www.komoot.com/smarttour/e782279858/warner-route': htmlResponse(`
        <html>
          <head>
            <meta property="og:title" content="Warner Route | hike | Komoot" />
          </head>
          <body>
            {"coordinates":{"href":"https://api.komoot.de/v007/tours/782279858/coordinates"}}
          </body>
        </html>
      `),
      'https://api.komoot.de/v007/tours/782279858/coordinates': jsonResponse({
        items: [
          { lat: 38.562706, lng: -107.741587, alt: 2519.4 },
          { lat: 38.566891, lng: -107.750795, alt: 2604.2 },
          { lat: 38.562706, lng: -107.741587, alt: 2519.4 }
        ]
      })
    });

    const area = await ingestHikingAppUrl(
      'https://www.komoot.com/smarttour/e782279858/warner-route',
      { fetch }
    );

    expect(area.name).toBe('Warner Route');
    expect(area.sourceProvider).toBe('komoot');
    expect(area.keyPoints.map((keyPoint) => keyPoint.label)).toEqual([
      'Start',
      'High point',
      'End'
    ]);
    expect(area.keyPoints[1].elevationM).toBe(2604);
  });

  it('imports an O-Trails/OpenTrails URL when embedded route geometry is present', async () => {
    const dataPage = htmlAttribute(
      JSON.stringify({
        props: {
          trail: {
            name: 'Lake Hayes Track',
            geometry: {
              type: 'LineString',
              coordinates: [
                [168.8081, -44.967, 336],
                [168.81704, -44.98, 370],
                [168.8081, -44.96702, 337]
              ]
            }
          }
        }
      })
    );
    const fetch = mockFetch({
      'https://www.opentrails.co.nz/trails/lake-hayes-track': htmlResponse(`
        <html>
          <body>
            <div id="app" data-page="${dataPage}"></div>
          </body>
        </html>
      `)
    });

    const area = await ingestHikingAppUrl(
      'https://www.opentrails.co.nz/trails/lake-hayes-track',
      { fetch }
    );

    expect(area.name).toBe('Lake Hayes Track');
    expect(area.sourceProvider).toBe('opentrails');
    expect(area.keyPoints.map((keyPoint) => keyPoint.elevationM)).toEqual([
      336, 370, 337
    ]);
  });

  it('returns a clear error when an O-Trails/OpenTrails page omits route geometry', async () => {
    const dataPage = htmlAttribute(
      JSON.stringify({
        props: {
          trail: {
            name: 'Lake Hayes Track',
            startLat: -44.967,
            startLng: 168.8081,
            endLat: -44.96702,
            endLng: 168.8081,
            altitudeMin: 336,
            altitudeMax: 370
          }
        }
      })
    );
    const fetch = mockFetch({
      'https://www.opentrails.co.nz/trails/lake-hayes-track': htmlResponse(
        `<div id="app" data-page="${dataPage}"></div>`
      )
    });

    await expect(
      ingestHikingAppUrl(
        'https://www.opentrails.co.nz/trails/lake-hayes-track',
        { fetch }
      )
    ).rejects.toMatchObject({
      code: 'missing-route-geometry',
      provider: 'opentrails'
    });
  });

  it('maps private routes to an inaccessible-route error', async () => {
    const fetch = mockFetch({
      'https://www.komoot.com/tour/123': new Response('Forbidden', {
        status: 403
      })
    });

    await expect(
      ingestHikingAppUrl('https://www.komoot.com/tour/123', { fetch })
    ).rejects.toBeInstanceOf(HikingUrlIngestionError);
    await expect(
      ingestHikingAppUrl('https://www.komoot.com/tour/123', { fetch })
    ).rejects.toMatchObject({
      code: 'inaccessible-route'
    });
  });
});

describe('isSupportedHikingAppUrl', () => {
  it('recognizes supported providers', () => {
    expect(isSupportedHikingAppUrl('https://www.komoot.com/tour/123')).toBe(
      true
    );
    expect(
      isSupportedHikingAppUrl('https://www.opentrails.co.nz/trails/lake')
    ).toBe(true);
    expect(isSupportedHikingAppUrl('https://example.com/routes/123')).toBe(
      false
    );
  });
});

function mockFetch(responses: Record<string, Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    const response = responses[url];

    if (!response) {
      return new Response('Not found', { status: 404 });
    }

    return response.clone();
  }) as typeof fetch;
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function htmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
