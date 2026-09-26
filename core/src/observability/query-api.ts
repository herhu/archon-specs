import { IngestionService } from './ingestion';
import { TraceModel, ArtifactLineage } from './models';
import { CrossTraceAnalyzer, CrossTraceIntelligence } from './intelligence-engine';
import { SuggestionGenerator, Suggestion } from './suggestion-generator';

export interface IntelligenceReport extends CrossTraceIntelligence {
    suggestions: Suggestion[];
}

export class ObservabilityQueryApi {
    constructor(private readonly ingestion: IngestionService) {}

    async getTraceTimeline(traceId: string): Promise<TraceModel | undefined> {
        await this.ingestion.sync();
        return this.ingestion.getTrace(traceId);
    }

    async getSystemIntelligence(): Promise<IntelligenceReport> {
        await this.ingestion.sync();
        const traces = this.ingestion.getTraces();
        const intelligence = CrossTraceAnalyzer.analyze(traces);
        const suggestions = SuggestionGenerator.generate(intelligence);
        
        return {
            ...intelligence,
            suggestions
        };
    }

    async searchTraces(query: { 
        planId?: string, 
        artifactPath?: string, 
        status?: string, 
        projectName?: string,
        serverName?: string,
        toolCategory?: string
    }): Promise<TraceModel[]> {
        await this.ingestion.sync();
        let traces = this.ingestion.getTraces();

        if (query.planId) {
            traces = traces.filter(t => t.metadata?.planId === query.planId);
        }
        if (query.status) {
            traces = traces.filter(t => t.status === query.status);
        }
        if (query.projectName) {
            traces = traces.filter(t => t.projectName === query.projectName);
        }
        if (query.serverName) {
            traces = traces.filter(t => t.spans.some(s => s.serverName === query.serverName));
        }
        if (query.toolCategory) {
            traces = traces.filter(t => t.spans.some(s => s.toolCategory === query.toolCategory));
        }
        if (query.artifactPath) {
            traces = traces.filter(t => t.spans.some(s => s.metadata.path === query.artifactPath));
        }

        return traces;
    }

    async getArtifactDeepDive(path: string): Promise<ArtifactLineage | undefined> {
        await this.ingestion.sync();
        return this.ingestion.getArtifactHistory(path);
    }

    async getAllLineage(): Promise<ArtifactLineage[]> {
        await this.ingestion.sync();
        return this.lineageToArtifactLineage();
    }

    private lineageToArtifactLineage(): ArtifactLineage[] {
        return this.ingestion.getLineage();
    }

    async getPlans(): Promise<any[]> {
        await this.ingestion.sync();
        return this.ingestion.getPlans();
    }

    async getPlan(planId: string): Promise<any | undefined> {
        await this.ingestion.sync();
        return this.ingestion.getPlan(planId);
    }
}
