import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on the server.', fallback: true },
        { status: 500 },
      );
    }

    const { kpis, filters } = await request.json();
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert HR and People Analytics executive consultant.
Analyze these aggregated, anonymized workforce, attendance, and payroll KPI metrics:
${JSON.stringify({ kpis, filters }, null, 2)}

Provide a concise, professional executive briefing in valid JSON format:
{
  "executiveSummary": "A 2-3 sentence high-level summary highlighting positive trends and potential cost or operational risks.",
  "recommendations": [
    "Concrete actionable recommendation 1",
    "Concrete actionable recommendation 2",
    "Concrete actionable recommendation 3"
  ],
  "keyObservation": "One critical highlight regarding punctuality, absenteeism, or overtime expense."
}
Only output the JSON object without code markdown ticks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const responseText = response.text || '';
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed: {
      executiveSummary?: string;
      recommendations?: string[];
      keyObservation?: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { executiveSummary: responseText, recommendations: [] };
    }

    const summary = parsed.executiveSummary
      ? `${parsed.executiveSummary}\n\n• Key Observation: ${parsed.keyObservation || 'Stable metrics'}\n• Recommendations:\n  ${(parsed.recommendations || []).map((recommendation) => `- ${recommendation}`).join('\n  ')}`
      : responseText;

    return NextResponse.json({ summary, ...parsed });
  } catch (error) {
    console.error('Error generating AI analytics summary:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI analytics summary. Using rule-based insights.', fallback: true },
      { status: 500 },
    );
  }
}
