/* global window */
import d3 from 'd3';
import { forceSimulation, forceManyBody, forceLink, forceX, forceY } from 'd3-force';

// eslint-disable-next-line
import style from 'PVWStyle/InfoVizNative/HyperbolicEdgeBundles.mcss';
// import FieldInformationProvider from '../../../InfoViz/Core/FieldInformationProvider';
import CompositeClosureHelper from '../../../Common/Core/CompositeClosureHelper';
import {
  // vectorMag,
  vectorDiff,
  vectorMAdd,
  // vectorDot,
  vectorScale,
  // pointsApproxCollinear,
  // lineLineIntersectFragile,
  // lineCircleIntersectFragile,
  hyperbolicPlanePointsToPoincareDisk,
  hyperbolicPlaneGeodesicOnPoincareDisk,
  // hyperbolicPlaneGeodesicsOnPoincareDisk,
  // interpolateOnPoincareDisk,
} from '../../../Common/Misc/HyperbolicGeometry';


function hyperbolicEdgeBundle(publicAPI, model) {
  // Return an array containing a point's coordinates:
  const coordsOf = (nn => [nn.x, nn.y]);

  publicAPI.resize = () => {
    if (!model.container) {
      return;
    }

    const rect = model.container.getBoundingClientRect();
    const smaller = rect.width < rect.height ? rect.width : rect.height;
    const tx = rect.width / smaller;
    const ty = rect.height / smaller;
    model.scale = smaller / 2.0;
    d3.select(model.container).select('svg')
      .attr('width', rect.width)
      .attr('height', rect.height);
    if (smaller > 0.0) {
      model.transformGroup.attr('transform',
        `scale(${smaller / 2.0}, ${smaller / 2.0}) translate(${tx}, ${ty})`);
    }
    // TODO: Now transition the point size and arc width to maintain
    //       the diagram's sense of proportion.
  };

  const linkToControlPts = (interpFocus, deltaT) => {
    // dd is an object with 'from' and 'to' keys that reference entries in model.nodes.
    // We must convert it to a path of control points starting with 'from' and going
    // up parents until the deepest common parent is reached, then descend to 'to'.
    // const upwards = [];
    // const dnwards = [];
    // for (let upNode = dd.from; upNode !== null; upNode = 'parent' in upNode ? upNode.parent : null) {
    //   upwards.push(upNode);
    // }
    // for (let dnNode = dd.to; dnNode !== null; dnNode = 'parent' in dnNode ? dnNode.parent : null) {
    //   dnwards.push(dnNode);
    // }
    // dnwards.reverse(); // places tree root at index 0
    // const trim = dnwards.reduce(
    //   (result, entry, ientry) => (upwards[upwards.length - ientry] === entry ? ientry : result),
    //   -1);
    // const pathPts = upwards.slice(0, upwards.length - trim - 1).concat(dnwards.slice(trim));
    if (interpFocus && deltaT) {
      // animating, so our normal attr function needs to return a function of time, 0 -> 1
      return (dd, i) => (
        (t) => {
          // dd.from and dd.to don't actually change, so they don't get interpolated.
          const coords = hyperbolicPlanePointsToPoincareDisk(
          [dd.from, dd.to].map(coordsOf), interpFocus(t), model.diskScale);

          const path = `M ${coords.map(pt => `${pt.x[0]} ${pt.x[1]}`).join(' L ')}`;
          return path;
        }
      );
    }
    return (dd, i) => {
      const coords = hyperbolicPlanePointsToPoincareDisk(
      [dd.from, dd.to].map(coordsOf), model.focus, model.diskScale);

      const path = `M ${coords.map(pt => `${pt.x[0]} ${pt.x[1]}`).join(' L ')}`;
      return path;
    };
  };
  const drawLinksToNode = (node, grp, deltaT, interpFocus) => {
    const topNodeLinks = model.linkData[node.id].reduce(
      (result, linkWeight, otherNodeId) =>
        (linkWeight > model.linkThreshold ? result.concat(
          [{ from: model.nodes[node.id], to: model.nodes[otherNodeId] }]) : result),
      []
    );
    const linkData = grp.selectAll(`.${style.bundleLink}`).data(topNodeLinks);
    linkData.exit().remove();
    linkData.enter().append('path')
      .classed(style.bundleLink, true);
    if (deltaT > 0) {
      linkData.transition().duration(deltaT)
        .attrTween('d', linkToControlPts(interpFocus, deltaT));
    } else {
      linkData
        .attr('d', linkToControlPts());
    }
  };

  publicAPI.setContainer = (el) => {
    if (model.container) {
      while (model.container.firstChild) {
        model.container.removeChild(model.container.firstChild);
      }
      delete model.unselectedBundleGroup;
      delete model.treeEdgeGroup;
      delete model.selectedBundleGroup;
      delete model.nodeGroup;
      delete model.transformGroup;
      // TODO: When el is null/undefined and API is provider, unsubscribe. Maybe move subscriptions to happen once?
    }

    model.container = el;

    if (model.container) {
      // Create top-level divs
      const containerDiv = d3.select(model.container).append('div'); // .classed('hyperbolic-geom-container', true);
      // containerDiv.append('div').classed('hyperbolic-controls', true);
      const viewdiv = containerDiv.append('div').classed(style.hyperbolicGeomContainer, true);
      // Apply style and create SVG for rendering
      const svg = viewdiv.append('svg').classed('hyperbolic-geom-svg', true);
      model.transformGroup = svg.append('g').classed('disk-transform', true);
      model.transformGroup.append('circle')
        .classed('disk-boundary', true)
        .classed(style.hyperbolicDiskBoundary, true)
        .attr('r', 1);
      model.unselectedBundleGroup = model.transformGroup.append('g').classed('unselected-bundles', true);
      model.treeEdgeGroup = model.transformGroup.append('g').classed('tree-edges', true);
      model.selectedBundleGroup = model.transformGroup.append('g').classed('selected-bundles', true);
      model.nodeGroup = model.transformGroup.append('g').classed('nodes', true);

      let mouseWheelMoving = false;
      svg.node().addEventListener('wheel', (event) => {
        if ('hyperbolicBounds' in model) {
          const maxScale = vectorDiff(model.hyperbolicBounds[0], model.hyperbolicBounds[1]).reduce(
            (a, b) => ((a > b) ? a : b)) * 2.0;
          model.diskScale = Math.min(Math.max(model.diskScale + (event.deltaY * 0.1), 0.5), maxScale);
          // console.log('wheel', event.deltaY, model.diskScale);
          if (!mouseWheelMoving) {
            window.requestAnimationFrame(() => {
              // console.log('   wheel', model.diskScale, maxScale);
              model.diskCoords = hyperbolicPlanePointsToPoincareDisk(
                model.nodes.map(coordsOf), model.focus, model.diskScale);
              publicAPI.coordsChanged(0);
              mouseWheelMoving = false;
            });
          }
          mouseWheelMoving = true;
        }
      }, { passive: true });

      publicAPI.resize(); // Apply a transform to the transformGroup based on the size of the SVG.

      // Auto unmount on destroy
      model.subscriptions.push({ unsubscribe: publicAPI.setContainer });

      // Fetch the mutual information matrix and mapping from row/column index to field name.
      if (model.provider.isA('FieldInformationProvider')) {
        model.fieldInformationSubscription =
          model.provider.subscribeToFieldInformation(
            (data) => {
              if (data && data.fieldMapping && data.mutualInformation) {
                // We make a copy of the fieldMapping here because we modify it
                // in a way that prevents serialization (object references to children),
                // and the provider uses serialization to track differences. Grrr.
                publicAPI.setMutualInformation(
                  JSON.parse(JSON.stringify(data.fieldMapping)),
                  data.mutualInformation);
              }
            });
        model.subscriptions.push(model.fieldInformationSubscription);
      }
      // Listen for hover events
      if (model.provider.isA('FieldHoverProvider')) {
        const hoverWeight = (d, highlight) => {
          const nodeName = model.nodes[d.id].name;
          const hv = highlight[nodeName];
          if (hv && hv.weight !== undefined) {
            if (hv.weight >= 0) return hv.weight;
          }
          return -1;
        };
        model.subscriptions.push(
          model.provider.onHoverFieldChange((hover) => {
            // console.log(hover);
            function updateDrawOrder(d, i) {
              if (model.nodes[d.id].name in hover.state.highlight) {
                this.parentNode.appendChild(this);
              }
            }
            let sawEmphasizedNode = false;
            const grp = model.nodeGroup
              .selectAll('.node');
            grp.select('circle')
              .classed(style.highlightedNode, d => (hoverWeight(d, hover.state.highlight) === 0))
              .classed(style.emphasizedNode, (d) => {
                if (hoverWeight(d, hover.state.highlight) > 0) {
                  // draw links in top 10%
                  drawLinksToNode(model.nodes[d.id], model.unselectedBundleGroup);
                  sawEmphasizedNode = true;
                  return true;
                }
                return false;
              });
            grp.select('svg')
              .classed(style.highlightedGlyph, d => (hoverWeight(d, hover.state.highlight) === 0))
              .classed(style.emphasizedGlyph, d => (hoverWeight(d, hover.state.highlight) > 0));

            grp.each(updateDrawOrder);
            if (!sawEmphasizedNode) {
              model.unselectedBundleGroup.selectAll(`.${style.bundleLink}`).remove();
            }
            if (hover.state.subject) {
              const focusNode = model.nodes.reduce((result, entry) => (
                entry.name === hover.state.subject ? entry : result),
                model.focusNode);
              publicAPI.focusChanged(focusNode);
            } else if (!model.focusNode) {
              model.selectedBundleGroup.selectAll(`.${style.bundleLink}`).remove();
            }
          }));
      }
    }
  };

  publicAPI.coordsChanged = (deltaT, newFocusNode) => {
    if (newFocusNode) {
      // hover node links turn into focus node links, so draw focus at the old position
      if (model.focusNode && deltaT > 0) {
        drawLinksToNode(model.focusNode, model.selectedBundleGroup);
      }
      model.focusNode = newFocusNode;
      model.prevFocus = model.focus;
      model.focus = coordsOf(model.focusNode);
    }

    model.diskCoords = hyperbolicPlanePointsToPoincareDisk(
      model.nodes.map(coordsOf), model.focus, model.diskScale);
    const nodes = model.nodeGroup.selectAll('.node').data(model.diskCoords, dd => dd.id);
    if (deltaT > 0) {
      nodes.transition().duration(deltaT)
        .attr('transform', d => `translate(${d.x[0]}, ${d.x[1]})`);
        // .attr('cx', d => d.x[0])
        // .attr('cy', d => d.x[1]);
      const interpFocus = (model.prevFocus ?
        d3.interpolate(model.prevFocus, model.focus) :
        () => model.focus);
      const updateArcs = (dd) => {
        if (dd.previous) {
          const interpP0 = d3.interpolate(dd.previous.p0, dd.p0);
          const interpP1 = d3.interpolate(dd.previous.p1, dd.p1);
          return t => hyperbolicPlaneGeodesicOnPoincareDisk(
            coordsOf(interpP0(t)), coordsOf(interpP1(t)), interpFocus(t), model.diskScale);
        }
        return t => hyperbolicPlaneGeodesicOnPoincareDisk(
          coordsOf(dd.p0), coordsOf(dd.p1), interpFocus(t), model.diskScale);
      };
      model.treeEdgeGroup.selectAll('.link').data(model.treeEdges, ee => ee.id)
        .transition().duration(deltaT)
        .attrTween('d', updateArcs);
      if (model.focusNode) {
        drawLinksToNode(model.focusNode, model.selectedBundleGroup, deltaT, interpFocus);
      }
    } else {
      nodes
        .attr('transform', d => `translate(${d.x[0]}, ${d.x[1]})`);
        // .attr('cx', d => d.x[0])
        // .attr('cy', d => d.x[1]);
      model.treeEdgeGroup.selectAll('.link').data(model.treeEdges, ee => ee.id)
        .attr('d', pp => hyperbolicPlaneGeodesicOnPoincareDisk(
          [pp.p0.x, pp.p0.y], [pp.p1.x, pp.p1.y], model.focus, model.diskScale));
      if (model.focusNode) {
        drawLinksToNode(model.focusNode, model.selectedBundleGroup);
      }
    }
    // cleanup
    model.unselectedBundleGroup.selectAll(`.${style.bundleLink}`).remove();
  };

  publicAPI.focusChanged = (node) => {
    publicAPI.coordsChanged(model.transitionTime, node);
  };

  function ensureLegendForNode(d, i) {
    const self = d3.select(this);
    if (self.select(`svg.${style.legendShape}`).empty()) {
      const { color, shape } = model.provider.getLegend(model.nodes[d.id].name);
      self.append('svg')
        .classed(style.legendShape, true)
        .attr('width', model.legendSize / model.scale)
        .attr('height', model.legendSize / model.scale)
        .attr('x', -1 * model.legendSize / model.scale / 2.0)
        .attr('y', -1 * model.legendSize / model.scale / 2.0)
        .attr('fill', color)
        .append('use')
        .attr('xlink:href', shape);
    }
  }

  publicAPI.spanningTreeUpdated = () => {
    // Remember old coordinates in "previous" before computing new ones:
    model.treeEdges = model.treeEdges.map(dd => ({
      id: dd.id,
      p0: dd.source,
      p1: dd.target,
      previous: {
        p0: Object.assign({}, dd.p0),
        p1: Object.assign({}, dd.p1),
      },
    }));
    model.diskCoords = hyperbolicPlanePointsToPoincareDisk(
      model.nodes.map(coordsOf), model.focus, model.diskScale);
    const ngdata = model.nodeGroup.selectAll('.node').data(model.diskCoords, dd => dd.id);
    const grp = ngdata.enter().append('g')
      .classed('node', true)
      .on('click', (d, i) => {
        if (model.provider.isA('FieldHoverProvider')) {
          const hover = model.provider.getFieldHoverState();
          hover.state.subject = model.nodes[d.id].name;
          hover.state.disposition = 'final';
          hover.state.highlight[hover.state.subject] = { weight: 1 };
          model.provider.setFieldHoverState(hover);
        } else {
          publicAPI.focusChanged(model.nodes[i]);
        }
      });
    grp.append('circle')
      .classed(style.hyperbolicNode, true)
      .attr('r', '0.02px');
    if (model.provider.isA('LegendProvider')) {
      // FIXME: This will not change the legend glyph for any pre-existing nodes!
      grp.each(ensureLegendForNode);
    }
    ngdata.exit().remove();
    if (model.provider.isA('FieldHoverProvider')) {
      ngdata
        .on('mouseenter', (d, i) => {
          const state = { highlight: {}, subject: '', disposition: 'preliminary' };
          state.highlight[model.nodes[d.id].name] = { weight: 1 };
          model.provider.setFieldHoverState({ state });
        })
        .on('mouseleave', () => {
          const state = { highlight: {}, subject: '', disposition: 'preliminary' };
          model.provider.setFieldHoverState({ state });
        });
    }
    const tgdata = model.treeEdgeGroup.selectAll('.link').data(model.treeEdges, dd => dd.id);
    tgdata.enter().append('path')
      .classed('link', true)
      .classed(style.hyperbolicTreeEdge, true);
    tgdata.exit().remove();
    publicAPI.coordsChanged(model.transitionTime);
  };

  publicAPI.layoutSpanningTree = () => {
    // NB: Some of this code relies on the order of model.treeEdges to start
    //     with the root node; to list parents as source, children as targets;
    //     and to list links from the top down.
    model.nodes.forEach((nn, ii) => { model.nodes[ii].children = []; });
    model.treeEdges.forEach((ee) => { ee.target.parent = ee.source; ee.source.children.push(ee.target); });
    const rootNode = model.treeEdges[0].source;
    // console.log('hierarchy ', d3.layout.hierarchy()(rootNode), rootNode);
    const maxDepth = model.nodes.reduce((depth, entry) => (entry.depth > depth ? entry.depth : depth), 1);
    const tidyTree = d3.layout.tree()
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth)
      .size([360, maxDepth * 10]);
    tidyTree(rootNode); // Assign x, y coordinates to each node.
    model.nodes.forEach((nn, ii) => {
      const tx = nn.x;
      const ty = nn.y;
      model.nodes[ii].x = ty * Math.cos(tx * Math.PI / 180.0);
      model.nodes[ii].y = ty * Math.sin(tx * Math.PI / 180.0);
    });

    // Relax the sparse tidy tree with force-directed layout:
    model.sim = forceSimulation(model.nodes)
      .force('charge', forceManyBody())
      .force('link', forceLink(model.treeEdges).distance(10).strength(1))
      .force('x', forceX())
      .force('y', forceY());

    // Give the tree a few iterations to relax before
    // we grab its bounding box for a default scale:
    for (let iter = 0; iter < 20; ++iter) {
      model.sim.tick();
    }
    model.sim.on('tick', () => publicAPI.coordsChanged(0));
    model.sim.restart();

    // Compute bounds and scaling
    model.hyperbolicBounds =
      model.nodes.reduce((result, value) => [
        [Math.min(result[0][0], value.x), Math.min(result[0][1], value.y)],
        [Math.max(result[1][0], value.x), Math.max(result[1][1], value.y)]],
        [[model.nodes[0].x, model.nodes[0].y], [model.nodes[0].x, model.nodes[0].y]]);
    model.focus = vectorScale(0.5, vectorMAdd(model.hyperbolicBounds[0], model.hyperbolicBounds[1], 1.0));
    model.diskScale = vectorDiff(model.hyperbolicBounds[0], model.hyperbolicBounds[1]).reduce(
      (a, b) => ((a > b) ? a : b)) / 2.0;
    publicAPI.spanningTreeUpdated();
  };

  publicAPI.setMutualInformation = (vars, mi) => {
    model.nodes = vars;
    // const map = {};
    // Identify root of tree (largest self-information):
    const nv = mi.length;
    let rr = 0;
    let ri = mi[rr][rr];
    for (let ii = 1; ii < nv; ++ii) {
      const selfInfo = mi[ii][ii];
      model.nodes[ii].value = selfInfo;
      if (selfInfo > ri) {
        ri = selfInfo;
        rr = ii;
      }
    }
    console.log('Root ', rr);

    // Get a threshold value of mutual information required for a link to
    // be considered "worth drawing". For now, pin it to the 90th percentile:
    const midata = mi.reduce((result, row, irow) => result.concat(row.slice(irow + 1)), []).sort();
    const ixx = midata.length * 0.9; // "exact index" of 90th percentile
    const ilo = Math.floor(ixx);
    const ihi = ilo + 1;
    model.linkThreshold = ((ihi - ixx) * midata[ilo]) + ((ixx - ilo) * midata[ihi]);
    model.linkData = mi;

    // II. Find descendants.
    model.treeEdges = [];
    const nodes = new Set([rr]);
    const nextNode = mi[rr].map(vv => ({ vmax: vv, vnod: rr }));
    delete nextNode[rr];
    while (nodes.size < nv) {
      // Find the largest entry:
      const linkToAdd =
        nextNode.reduce((result, entry, ii) =>
          (entry.vmax > result.vmax && !nodes.has(ii) ? Object.assign({ vlnk: ii }, entry) : result),
          { vmax: -1, vnod: -1, vlnk: -1 });
      if (linkToAdd.vlnk >= 0) {
        nodes.add(linkToAdd.vlnk);
        // missing.delete(linkToAdd.vlnk);
        model.treeEdges.push({ id: model.treeEdges.length, source: vars[linkToAdd.vnod], target: vars[linkToAdd.vlnk] });
        // Now update nextNode:
        delete nextNode[linkToAdd.vlnk];
        const miRow = mi[linkToAdd.vlnk];
        nextNode.forEach((vv, ii) => {
          if (vv.vmax < miRow[ii]) {
            nextNode[ii].vmax = miRow[ii];
            nextNode[ii].vnod = linkToAdd.vlnk;
          }
        });
      } else {
        console.log('Error: not done adding links but no more entries available.');
        break;
      }
    }

    publicAPI.layoutSpanningTree();
  };

  publicAPI.getState = () => model;
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  container: null,
  color: 'inherit',
  transitionTime: 500,
  legendSize: 16,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  CompositeClosureHelper.destroy(publicAPI, model);
  CompositeClosureHelper.isA(publicAPI, model, 'VizComponent');
  CompositeClosureHelper.get(publicAPI, model, ['color', 'container', 'transitionTime']);
  CompositeClosureHelper.set(publicAPI, model, ['transitionTime']);

  hyperbolicEdgeBundle(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = CompositeClosureHelper.newInstance(extend);

// ----------------------------------------------------------------------------

export default { newInstance, extend };