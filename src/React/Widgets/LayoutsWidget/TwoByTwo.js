import React from 'react';
import PropTypes from 'prop-types';

import style from 'PVWStyle/ReactWidgets/LayoutsWidget.mcss';

export default function render(props) {
  return (
    <table
      className={props.active === '2x2' ? style.activeTable : style.table}
      name="2x2"
      onClick={props.onClick}
    >
      <tbody>
        <tr>
          <td
            className={props.activeRegion === 0 ? style.activeTd : style.td}
          />
          <td
            className={props.activeRegion === 1 ? style.activeTd : style.td}
          />
        </tr>
        <tr>
          <td
            className={props.activeRegion === 2 ? style.activeTd : style.td}
          />
          <td
            className={props.activeRegion === 3 ? style.activeTd : style.td}
          />
        </tr>
      </tbody>
    </table>
  );
}

render.propTypes = {
  onClick: PropTypes.func,
  active: PropTypes.string,
  activeRegion: PropTypes.number,
};

render.defaultProps = {
  onClick: () => {},
  activeRegion: -1,
};
