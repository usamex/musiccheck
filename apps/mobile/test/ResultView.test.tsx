import { render, screen } from '@testing-library/react-native';

import { ResultView } from '../src/components/ResultView';
import { makeHistoryEntry } from '../src/history/historyStore';
import { matchedBody } from './fixtures';

describe('<ResultView />', () => {
  it('renders title, artist, album, provider label, offset and a placeholder without artwork', async () => {
    const entry = makeHistoryEntry(matchedBody(), 'microphone', new Date('2026-10-17T20:00:00Z'));
    await render(<ResultView entry={entry} showDiagnostics={false} />);

    expect(screen.getByTestId('result-title')).toHaveTextContent('Example Song');
    expect(screen.getByTestId('result-artist')).toHaveTextContent('Example Artist');
    expect(screen.getByTestId('result-album')).toHaveTextContent('Example Album');
    expect(screen.getByTestId('result-provider')).toHaveTextContent('Identified by MusicCheck model');
    expect(screen.getByTestId('result-offset')).toHaveTextContent('Matched at 0:42 into the track');
    expect(screen.getByTestId('result-artwork-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('result-artwork')).toBeNull();
    // confidence is null → no percentage anywhere
    expect(screen.queryByTestId('result-confidence')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    // score is shown only as a raw similarity value
    expect(screen.getByTestId('result-score')).toHaveTextContent(/Similarity score 0\.910/);
    expect(screen.queryByTestId('result-query')).toBeNull();
  });

  it('shows artwork, external provider, calibrated confidence and diagnostics when present', async () => {
    const response = matchedBody({
      provider: 'acrcloud',
      provider_kind: 'external_service',
      confidence: 0.87,
      matched_offset_seconds: null,
    });
    response.track = { ...response.track, album: null, artwork_url: 'https://example.com/a.jpg' };
    const entry = makeHistoryEntry(response, 'microphone');
    await render(<ResultView entry={entry} showDiagnostics />);

    expect(screen.getByTestId('result-artwork')).toBeTruthy();
    expect(screen.queryByTestId('result-album')).toBeNull();
    expect(screen.getByTestId('result-provider')).toHaveTextContent('Identified via acrcloud');
    expect(screen.getByTestId('result-confidence')).toHaveTextContent('Confidence: 87%');
    expect(screen.queryByTestId('result-offset')).toBeNull();
    expect(screen.getByTestId('result-query')).toHaveTextContent('Server decoded: aac · 44100 Hz · 1 ch · 9.98 s');
  });
});
