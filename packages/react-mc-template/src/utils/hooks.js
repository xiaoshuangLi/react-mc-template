import React, {
  useMemo,
  useEffect,
  forwardRef,
} from 'react';
import { findDOMNode } from 'react-dom';

import {
  useContainer,
  useDragAndHover,
  useDragAndDrop,
} from 'react-mc-dnd';

import memoize from 'shared/memoize';
import Highlight from 'shared/Highlight';
import { findRelationKeysGroup } from 'shared/relation';
import {
  useEventCallback,
  useThrottleCallback,
} from 'shared/hooks';

import Core from './Core';
import defaultOptions from './options';

const getKey = memoize((...args) => args);

const findRookie = (prevTemplate = {}, nextTemplate = {}) => {
  const { componentMap: prevComponentMap = {} } = prevTemplate;
  const { componentMap: nextComponentMap = {} } = nextTemplate;

  const nextComponents = Object.values(nextComponentMap);

  return nextComponents.find((component = {}) => {
    const { id: componentId } = component;

    return prevComponentMap[componentId] === undefined;
  });
};

const withContainer = memoize((ComponentClass) => forwardRef((props = {}, ref) => {
  const { __component: data = {}, ...others } = props;

  useContainer(ref, data);

  return (
    <ComponentClass ref={ref} {...others} />
  );
}));

const withDragAndHover = memoize((ComponentClass) => forwardRef((props = {}, ref) => {
  const { __component: data = {}, ...others } = props;

  useDragAndHover(ref, data);

  return (
    <ComponentClass ref={ref} {...others} />
  );
}));

const withDragAndDrop = memoize((ComponentClass) => forwardRef((props = {}, ref) => {
  const { __component: data = {}, ...others } = props;

  useDragAndDrop(ref, data);

  return (
    <ComponentClass ref={ref} {...others} />
  );
}));

const useMergedOptions = (props = {}) => {
  const { options = {} } = props;

  const denpendencies = Object.values(options);

  return useMemo(
    () => ({
      ...defaultOptions,
      ...options,
    }),
    denpendencies,
  );
};

const useGetComponentChildrenKeys = (props = {}) => {
  const options = useMergedOptions(props) || {};

  const {
    getComponentPropsSchema,
    getComponentChildrenKeys,
  } = options;

  return useEventCallback((component = {}) => {
    const childrenKeys = getComponentChildrenKeys(component);

    if (childrenKeys !== undefined) {
      return childrenKeys;
    }

    const propsSchema = getComponentPropsSchema(component) || {};
    const { properties = {} } = propsSchema;
    const { children: { type } = {} } = properties;

    return type === 'node' ? ['children'] : [];
  });
};

export const useCore = (props = {}) => {
  const { core: propsCore } = props;

  const options = useMergedOptions(props) || {};
  const getComponentChildrenKeys = useGetComponentChildrenKeys(props);

  return useMemo(() => {
    const core = propsCore || new Core();

    core.reset({
      ...options,
      getComponentChildrenKeys,
    });

    return core;
  }, [options, propsCore, getComponentChildrenKeys]);
};

const useGetComponentClass = (props = {}) => {
  const { value = {} } = props;

  const core = useCore(props);
  const options = useMergedOptions(props) || {};
  const getComponentChildrenKeys = useGetComponentChildrenKeys(props);

  const { getComponentClass } = options;

  return useEventCallback((component = {}) => {
    const ComponentClass = getComponentClass(component) || 'div';

    let HOC;
    const relatedParentIds = core.findRelatedParentIds(value)(component) || [];
    const childrenKeys = getComponentChildrenKeys(component) || [];

    if (relatedParentIds.length) {
      HOC = withContainer;
    } else {
      HOC = childrenKeys.length ? withDragAndDrop : withDragAndHover;
    }

    return HOC(ComponentClass);
  });
};

const useGetComponentRenderDependencies = (props = {}) => {
  const { value, selectedComponent = {} } = props;

  const core = useCore(props);
  const options = useMergedOptions(props) || {};
  const getComponentChildrenKeys = useGetComponentChildrenKeys(props);

  const findRelatedParentIds = useMemo(() => {
    return memoize(
      (...args) => memoize(core.findRelatedParentIds(...args)),
    );
  }, [core]);

  const { getComponentRenderDependencies } = options;

  return useEventCallback((component = {}) => {
    const { id: selectedComponentId } = selectedComponent;
    const { id: componentId } = component;

    const childrenKeys = getComponentChildrenKeys(component) || [];
    const key = childrenKeys.join('/');

    const selected = selectedComponentId === componentId;
    const rest = getComponentRenderDependencies(component) || [];

    const relatedParentIds = findRelatedParentIds(value)(selectedComponent) || [];
    const contained = relatedParentIds[0] === componentId;

    return [key, selected, contained, ...rest];
  });
};

const useRender = (props = {}) => {
  const options = useMergedOptions(props) || {};
  const getComponentChildrenKeys = useGetComponentChildrenKeys(props);

  const { render } = options;

  return useEventCallback((ComponentClass, component) => (renderProps = {}, ref) => {
    let { key } = renderProps;
    const childrenKeys = getComponentChildrenKeys(component) || [];

    key = getKey(key, ...childrenKeys);
    renderProps = { ...renderProps, key, __component: component };

    return render(ComponentClass, component)(renderProps, ref);
  });
};

export const useOptions = (props = {}) => {
  const options = useMergedOptions(props);

  const getComponentClass = useGetComponentClass(props);
  const getComponentRenderDependencies = useGetComponentRenderDependencies(props);
  const render = useRender(props);

  return useMemo(
    () => ({
      ...options,
      getComponentClass,
      getComponentRenderDependencies,
      render,
    }),
    [options, getComponentClass, getComponentRenderDependencies, render],
  );
};

export const useDndValue = (props = {}) => {
  const {
    value: propsValue = {},
    selectedComponent: propsSelectedComponent = {},
    document: propsDocument = document,
    onChange = () => {},
    onSelectComponent = () => {},
  } = props;

  const core = useCore(props);
  const highlight = useMemo(
    () => new Highlight(propsDocument.documentElement),
    [propsDocument],
  );

  const isInChildren = useEventCallback(
    core.isInChildren(propsValue),
  );

  const onDragHover = useThrottleCallback((targetInfo = {}, component = {}) => {
    let value = core.cutComponent(propsValue)(component);
    value = core.appendComponent(value)(targetInfo, component);

    const rookie = findRookie(propsValue, value);

    onChange(value);
    rookie && onSelectComponent(rookie);
  }, 180, { trailing: false });

  const onClick = useEventCallback((dom, component = {}) => {
    const { id: componentId } = component;

    componentId && onSelectComponent(component);
  });

  const onDragEnd = useEventCallback((dom, component = {}) => {
    const { id: componentId } = component;

    componentId && onSelectComponent(component);
  });

  const onRender = useEventCallback((dom, component = {}) => {
    const { id: selectedComponentId } = propsSelectedComponent;
    const { id: componentId } = component;

    const relatedParentIds = core.findRelatedParentIds(propsValue)(propsSelectedComponent) || [];
    const contained = relatedParentIds[0] === componentId;
    const selected = selectedComponentId === componentId;

    if (!dom) {
      return;
    }

    if (!selected && !contained) {
      return;
    }

    const style = {
      'border-style': contained ? 'dashed' : 'solid',
    };

    highlight.render(dom, style);
  });

  return useMemo(() => ({
    dummy: true,
    isInChildren,
    onDragEnd,
    onDragHover,
    onRender,
    onClick,
  }), [isInChildren, onDragEnd, onDragHover, onClick, onRender]);
};

export const useTriggers = (props = {}, ref) => {
  const {
    document: propsDocument = document,
    value: propsValue = {},
    selectedComponent: propsSelectedComponent = {},
    onChange = () => {},
    onSelectComponent = () => {},
    onKeyDown: propsOnKeyDown = () => {},
  } = props;

  const core = useCore(props);

  const listeners = [
    // 复制 cmd/ctrl c
    {
      metaOrCtrl: true,
      which: 67,
      fn: () => core.copyComponent(propsValue)(propsSelectedComponent),
    },
    // 剪切 cmd/ctrl x
    {
      metaOrCtrl: true,
      which: 88,
      fn: () => ({
        component: core.findClosestComponent(propsValue)(propsSelectedComponent),
        template: core.cutComponent(propsValue)(propsSelectedComponent),
      }),
    },
    // 黏贴 cmd/ctrl v
    {
      metaOrCtrl: true,
      which: 86,
      fn: () => ({
        template: core.pasteComponent(propsValue)(propsSelectedComponent),
      }),
    },
    // 选中父节点 左
    {
      which: 37,
      fn: () => {
        const parent = core.findParent(propsValue)(propsSelectedComponent);

        if (parent) {
          return { component: parent };
        }
      },
    },
    // 选中子节点 右
    {
      which: 39,
      fn: () => {
        const bastard = core.findBastard(propsValue)(propsSelectedComponent);

        if (bastard) {
          return { component: bastard };
        }
      },
    },
    // 选中平级上一个节点 上
    {
      which: 38,
      fn: () => ({
        component: core.findPrevComponent(propsValue)(propsSelectedComponent),
      }),
    },
    // 选中平级下一个节点 下
    {
      which: 40,
      fn: () => ({
        component: core.findNextComponent(propsValue)(propsSelectedComponent),
      }),
    },
    // 删除 del
    {
      which: 8,
      fn: () => ({
        component: core.findClosestComponent(propsValue)(propsSelectedComponent),
        template: core.removeComponent(propsValue)(propsSelectedComponent),
      }),
    },
  ];

  const onKeyDown = useEventCallback((e) => {
    const { current } = ref;

    if (!current) {
      return;
    }

    const container = findDOMNode(current);
    const hoveredElements = Array.from(propsDocument.querySelectorAll('*:hover'));
    const hovered = hoveredElements.includes(container);

    if (!hovered) {
      return;
    }

    const { metaKey, ctrlKey, which } = e;
    const metaOrCtrl = metaKey || ctrlKey;
    const obj = { metaOrCtrl, which };

    const listener = listeners.find((item = {}) => {
      const { fn, ...others } = item;
      const keys = Object.keys(others);

      return keys.every((key) => obj[key] === others[key]);
    }) || {};

    const { fn } = listener;
    const data = fn && fn();

    if (fn) {
      e.preventDefault();
    }

    if (data) {
      const { template, component } = data;

      template && onChange(template);
      component && onSelectComponent(component);
    }

    propsOnKeyDown(e);
  });

  useEffect(() => {
    propsDocument.addEventListener('keydown', onKeyDown, true);
    return () => propsDocument.removeEventListener('keydown', onKeyDown, true);
  }, [propsDocument, onKeyDown, ref]);

  useEffect(() => {
    if (document !== propsDocument) {
      document.addEventListener('keydown', onKeyDown, true);
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }
  }, [propsDocument, onKeyDown, ref]);
};
