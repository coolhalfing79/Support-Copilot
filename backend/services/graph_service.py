import logging
from typing import Any, Dict, List
import asyncio
from ai.llm_engine import LLMEngine

logger = logging.getLogger(__name__)

class GraphService:
    def __init__(self, llm_engine: LLMEngine):
        self.llm_engine = llm_engine

    async def generate_graph_for_query(self, query: str, context: str = "") -> Dict[str, Any]:
        """
        Dynamically generates a focused contextual subgraph for a user query.
        """
        if not context:
            # Fallback to a very simple graph if no context provided
            return {
                "nodes": [{"id": "n1", "label": query[:30], "type": "Process"}],
                "edges": []
            }

        prompt = f"""
        You are a Knowledge Graph extraction engine. 
        Analyze the following user query and the retrieved context documents.
        Extract the key entities and their semantic relationships to build a focused contextual subgraph.
        
        USER QUERY: {query}
        
        CONTEXT DOCUMENTS:
        {context[:4000]} # Limit context to avoid token overflow
        
        RULES:
        1. Extract 5 to 10 most relevant nodes.
        2. Extract meaningful relationships (eligible_for, has_deadline, governed_by, requires, belongs_to, references, related_to, managed_by, connected_to, depends_on).
        3. Node types MUST be one of: Program, Policy, Department, Student, Financial, Deadline, Document, Process, API, Product, Service, Requirement.
        4. The graph should explain how the answer to the query was derived.
        5. Return a valid JSON object.
        """

        schema_hint = """
        {
          "nodes": [
            { "id": "string", "label": "string", "type": "string", "confidence": 0.95 }
          ],
          "edges": [
            { "id": "string", "source": "node_id", "target": "node_id", "label": "string" }
          ]
        }
        """

        try:
            graph_data = await self.llm_engine.generate_structured_response(prompt, schema_hint)
            
            # Post-processing: ensure IDs and types are consistent
            valid_types = ["Program", "Policy", "Department", "Student", "Financial", "Deadline", "Document", "Process", "API", "Product", "Service", "Requirement"]
            
            for node in graph_data.get("nodes", []):
                if node.get("type") not in valid_types:
                    node["type"] = "Process" # Fallback
                    
            return graph_data
        except Exception as e:
            logger.error(f"Error generating dynamic graph: {e}")
            return {
                "nodes": [{"id": "error", "label": "Graph Generation Error", "type": "Policy"}],
                "edges": []
            }

# Function for backward compatibility or simple usage
async def generate_graph_for_query_compat(query: str, context: str = "") -> Dict[str, Any]:
    from ai.llm_engine import get_llm_engine
    service = GraphService(get_llm_engine())
    return await service.generate_graph_for_query(query, context)
