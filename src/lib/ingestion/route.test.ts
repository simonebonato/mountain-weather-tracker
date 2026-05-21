import { describe, expect, it } from 'vitest';
import { ingestGpx } from './gpx';
import { extractRouteKeyPoints, type RouteTrackPoint } from './route';

describe('extractRouteKeyPoints', () => {
  it('collapses a flat route to one representative point', () => {
    const keyPoints = extractRouteKeyPoints([
      point(46.1, 7.1, 1200),
      point(46.2, 7.2, 1202),
      point(46.3, 7.3, 1201)
    ]);

    expect(keyPoints).toEqual([
      {
        label: 'Route',
        latitude: 46.2,
        longitude: 7.2,
        elevationM: 1202
      }
    ]);
  });

  it('extracts start, high point, and end for a simple mountain route', () => {
    const keyPoints = extractRouteKeyPoints([
      point(46.1, 7.1, 900),
      point(46.2, 7.2, 1400),
      point(46.3, 7.3, 910)
    ]);

    expect(keyPoints.map((keyPoint) => keyPoint.label)).toEqual([
      'Start',
      'High point',
      'End'
    ]);
    expect(keyPoints.map((keyPoint) => keyPoint.elevationM)).toEqual([
      900, 1400, 910
    ]);
  });

  it('caps multi-summit routes at five key points', () => {
    const keyPoints = extractRouteKeyPoints([
      point(46.1, 7.1, 900),
      point(46.2, 7.2, 1220),
      point(46.3, 7.3, 930),
      point(46.4, 7.4, 1500),
      point(46.5, 7.5, 940),
      point(46.6, 7.6, 1430),
      point(46.7, 7.7, 950),
      point(46.8, 7.8, 1350),
      point(46.9, 7.9, 910)
    ]);

    expect(keyPoints).toHaveLength(5);
    expect(keyPoints.map((keyPoint) => keyPoint.label)).toEqual([
      'Start',
      'High point',
      'High point 2',
      'High point 3',
      'End'
    ]);
    expect(keyPoints.map((keyPoint) => keyPoint.elevationM)).toEqual([
      900, 1500, 1430, 1350, 910
    ]);
  });
});

describe('ingestGpx', () => {
  it('builds an area through the shared route key-point extraction', () => {
    const area = ingestGpx(`
      <gpx>
        <trk>
          <name>Snow Ridge</name>
          <trkseg>
            <trkpt lat="46.1" lon="7.1"><ele>900</ele></trkpt>
            <trkpt lat="46.2" lon="7.2"><ele>1400</ele></trkpt>
            <trkpt lat="46.3" lon="7.3"><ele>910</ele></trkpt>
          </trkseg>
        </trk>
      </gpx>
    `);

    expect(area.name).toBe('Snow Ridge');
    expect(area.keyPoints.map((keyPoint) => keyPoint.label)).toEqual([
      'Start',
      'High point',
      'End'
    ]);
  });
});

function point(
  latitude: number,
  longitude: number,
  elevationM: number
): RouteTrackPoint {
  return { latitude, longitude, elevationM };
}
