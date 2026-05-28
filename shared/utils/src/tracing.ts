import { AsyncLocalStorage } from 'async_hooks';

export const TRACE_ID_HEADER = 'x-trace-id';
export const SPAN_ID_HEADER = 'x-span-id';
export const PARENT_SPAN_ID_HEADER = 'x-parent-span-id';

interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}


const traceContextStorage = new AsyncLocalStorage<TraceContext>();


const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const generateTraceId = (): string => {
  return generateId();
};

export const generateSpanId = (): string => {
  return generateId();
};


export const getTraceContext = (): TraceContext | undefined => {
  return traceContextStorage.getStore();
};


export const setTraceContext = (context: TraceContext): void => {
  traceContextStorage.enterWith(context);
};


export const extractTraceContext = (headers: Record<string, any>): TraceContext => {
  const traceId = headers[TRACE_ID_HEADER] || generateTraceId();
  const parentSpanId = headers[SPAN_ID_HEADER];
  const spanId = generateSpanId();

  return {
    traceId,
    spanId,
    parentSpanId,
  };
};


export const injectTraceContext = (headers: Record<string, any>): Record<string, any> => {
  const context = getTraceContext();
  
  if (context) {
    return {
      ...headers,
      [TRACE_ID_HEADER]: context.traceId,
      [SPAN_ID_HEADER]: context.spanId,
      [PARENT_SPAN_ID_HEADER]: context.parentSpanId,
    };
  }
  
  return headers;
};


export const runWithTraceContext = <T>(context: TraceContext, fn: () => T): T => {
  return traceContextStorage.run(context, fn);
};


export const createChildSpan = (operationName: string): TraceContext => {
  const parentContext = getTraceContext();
  
  if (parentContext) {
    return {
      traceId: parentContext.traceId,
      spanId: generateSpanId(),
      parentSpanId: parentContext.spanId,
    };
  }
  

  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
  };
};


export class Span {
  private traceId: string;
  private spanId: string;
  private parentSpanId?: string;
  private operationName: string;
  private startTime: number;
  private endTime?: number;
  private tags: Record<string, any> = {};
  private logs: Array<{ timestamp: number; fields: Record<string, any> }> = [];

  constructor(operationName: string, context?: TraceContext) {
    this.operationName = operationName;
    
    if (context) {
      this.traceId = context.traceId;
      this.spanId = context.spanId;
      this.parentSpanId = context.parentSpanId;
    } else {
      const newContext = createChildSpan(operationName);
      this.traceId = newContext.traceId;
      this.spanId = newContext.spanId;
      this.parentSpanId = newContext.parentSpanId;
    }
    
    this.startTime = Date.now();
  }

  setTag(key: string, value: any): this {
    this.tags[key] = value;
    return this;
  }

  log(fields: Record<string, any>): this {
    this.logs.push({
      timestamp: Date.now(),
      fields,
    });
    return this;
  }

  finish(): void {
    this.endTime = Date.now();
  }

  getContext(): TraceContext {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
    };
  }

  toJSON() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      operationName: this.operationName,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? this.endTime - this.startTime : undefined,
      tags: this.tags,
      logs: this.logs,
    };
  }
}


export class Tracer {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  startSpan(operationName: string, parentContext?: TraceContext): Span {
    const span = new Span(operationName, parentContext);
    span.setTag('service.name', this.serviceName);
    

    setTraceContext(span.getContext());
    
    return span;
  }

  extract(headers: Record<string, any>): TraceContext {
    return extractTraceContext(headers);
  }

  inject(headers: Record<string, any>): Record<string, any> {
    return injectTraceContext(headers);
  }
}


let tracerInstance: Tracer | null = null;

export const initializeTracer = (serviceName: string): Tracer => {
  if (!tracerInstance) {
    tracerInstance = new Tracer(serviceName);
  }
  return tracerInstance;
};

export const getTracer = (): Tracer => {
  if (!tracerInstance) {
    throw new Error('Tracer not initialized. Call initializeTracer first.');
  }
  return tracerInstance;
};
